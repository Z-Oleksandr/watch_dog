import { DecoGauge } from "../../render/gauge/deco_gauge.js";
import { GaugeCluster } from "../../render/gauge/gauge_cluster.js";
import { percentZones } from "../../render/gauge/drawing.js";
import { log } from "../../util/logger.js";
import { driveReading, sameTemps, summarizeDriveTemps } from "./drive_temps.js";
import {
    NET_BASE_MAX,
    distributeThreads,
    groupSensors,
    netZones,
    tempClusterOptions,
} from "./layout.js";
import { buildUnavailableSection } from "./unavailable_section.js";

const NET_WIDE_MAX = 1000;
const NET_TEST_KBPS = 999_000;
const MOBILE_BREAKPOINT_PX = 768;
const MAX_CPU_CLUSTERS_DESKTOP = 4;
const MAX_CPU_CLUSTERS_MOBILE = 2;

const round = (v) => Math.round(v);

/**
 * The gauge dashboard: CPU, temperature and storage clusters plus RAM and
 * network dials. Built once with placeholders, rebuilt from the topology
 * frame, and updated from stats frames.
 */
export class Panel {
    #roots;
    #cpuCluster = null;
    #tempCluster = null;
    #storageCluster = null;
    #ramGauge = null;
    #netGauges = [];
    #tempPlacard = null;
    #cpuDistribution = [];
    #tempGroups = [];
    #netTesting = false;
    #topologyKey = null;
    #diskTempWarnings = [];
    #lastDiskTemps = null;

    /**
     * @param {{ cpu: HTMLElement, temp: HTMLElement, storage: HTMLElement,
     *           ram: HTMLElement, netDown: HTMLElement, netUp: HTMLElement }} roots
     */
    constructor(roots) {
        this.#roots = roots;
        this.#buildDefault();
    }

    get isInitialized() {
        return this.#topologyKey !== null;
    }

    /**
     * Builds the gauges for a topology frame. Re-applying the same topology is
     * a no-op; a different one (engine restarted with new hardware) rebuilds.
     */
    applyTopology(data) {
        const key = JSON.stringify([
            data.num_cpus,
            data.disks_space,
            data.init_ram_total,
            data.temp_sensors,
            data.disks_temp_warning,
        ]);
        if (key === this.#topologyKey) {
            return;
        }
        if (this.#topologyKey !== null) {
            log.info("panel", "topology changed, rebuilding gauges");
        }
        this.#topologyKey = key;
        this.#teardown();

        const numCpus = data.num_cpus;
        const maxClusters =
            window.innerWidth < MOBILE_BREAKPOINT_PX
                ? MAX_CPU_CLUSTERS_MOBILE
                : MAX_CPU_CLUSTERS_DESKTOP;
        const clusterCount = Math.min(maxClusters, numCpus);
        this.#cpuDistribution = distributeThreads(numCpus, clusterCount);

        let threadStart = 0;
        const cpuMembers = this.#cpuDistribution.map((count) => {
            const label =
                count === 1 ? `T${threadStart}` : `T${threadStart}-${threadStart + count - 1}`;
            threadStart += count;
            return { label, unit: "%", max: 100, format: round };
        });

        this.#cpuCluster = new GaugeCluster(this.#roots.cpu, {
            id: "cpu",
            title: "CPU",
            summary: { label: "CPU", unit: "%", max: 100, format: round },
            members: cpuMembers,
        });

        const sensors = data.temp_sensors || [];
        if (sensors.length === 0) {
            this.#tempPlacard = buildUnavailableSection(
                this.#roots.temp,
                "Temperature",
                "sensors not available"
            );
        } else {
            this.#tempGroups = groupSensors(sensors);
            this.#tempCluster = new GaugeCluster(
                this.#roots.temp,
                tempClusterOptions(this.#tempGroups)
            );
        }

        const ramMax = Math.round(data.init_ram_total / 1000);
        this.#ramGauge = new DecoGauge(this.#roots.ram, {
            label: "RAM",
            unit: "GB",
            max: ramMax,
            zones: percentZones(ramMax),
            format: round,
        });

        this.#netGauges = this.#buildNetGauges();

        this.#diskTempWarnings = data.disks_temp_warning ?? [];
        const diskMembers = data.disks_space.map((space, i) => ({
            label: `Disk ${i}`,
            unit: "GB",
            max: space,
            zones: percentZones(space),
            format: round,
        }));

        this.#storageCluster = new GaugeCluster(this.#roots.storage, {
            id: "storage",
            title: "Storage",
            summary:
                diskMembers.length === 1
                    ? diskMembers[0]
                    : {
                          label: "Total",
                          unit: "%",
                          max: 100,
                          zones: percentZones(100),
                          aggregate: "sum-ratio",
                          format: round,
                      },
            members: diskMembers,
        });
    }

    applyStats(data) {
        if (!this.isInitialized) {
            return;
        }

        const usage = data.cpu_usage;
        let offset = 0;
        const clusterValues = this.#cpuDistribution.map((count) => {
            const slice = usage.slice(offset, offset + count);
            offset += count;
            if (slice.length === 0) return 0;
            return slice.reduce((a, b) => a + b, 0) / slice.length;
        });
        const overall = usage.length ? usage.reduce((a, b) => a + b, 0) / usage.length : 0;
        this.#cpuCluster.setValues(clusterValues, overall);

        if (this.#tempCluster && Array.isArray(data.temperatures)) {
            const groupValues = this.#tempGroups.map((group) => {
                const readings = group.indices
                    .map((i) => data.temperatures[i])
                    .filter((t) => typeof t === "number");
                return readings.length ? Math.max(...readings) : 0;
            });
            this.#tempCluster.setValues(groupValues);
        }

        this.#ramGauge.set(data.ram_used / 1000);
        this.#storageCluster.setValues(data.disks_used_space.map((used) => used / 1000));
        this.#applyDiskTemps(data.disks_temperatures);

        const received = this.#netTesting ? NET_TEST_KBPS : data.network_received;
        const transmitted = this.#netTesting ? NET_TEST_KBPS : data.network_transmitted;
        [received, transmitted].forEach((kbps, i) => {
            const gauge = this.#netGauges[i];
            if (kbps > NET_BASE_MAX * 1000 && gauge.maxValue !== NET_WIDE_MAX) {
                gauge.setMax(NET_WIDE_MAX, { zones: netZones(NET_WIDE_MAX) });
            }
            gauge.set(kbps / 1000);
        });
    }

    sweep() {
        this.#clusters().forEach((c) => c.sweep());
        this.#gauges().forEach((g) => g.sweep());
    }

    zero() {
        this.#lastDiskTemps = null;
        this.#clusters().forEach((c) => c.zero());
        this.#gauges().forEach((g) => g.set(0));
    }

    setNetTesting(state) {
        this.#netTesting = Boolean(state);
    }

    destroy() {
        this.#teardown();
        this.#topologyKey = null;
    }

    /** Drive temperatures change every 30 s but arrive with every stats frame. */
    #applyDiskTemps(temps) {
        if (!Array.isArray(temps) || sameTemps(temps, this.#lastDiskTemps)) {
            return;
        }
        this.#lastDiskTemps = temps;
        const warnings = this.#diskTempWarnings;
        const readings = temps.map((celsius, i) => driveReading(celsius, warnings[i]));
        const summary = readings.length === 1 ? readings[0] : summarizeDriveTemps(temps, warnings);
        this.#storageCluster.setAuxReadings(readings, summary);
    }

    #clusters() {
        return [this.#cpuCluster, this.#tempCluster, this.#storageCluster].filter(Boolean);
    }

    #gauges() {
        return [this.#ramGauge, ...this.#netGauges].filter(Boolean);
    }

    #buildNetGauges() {
        return [
            ["Down", this.#roots.netDown],
            ["Up", this.#roots.netUp],
        ].map(
            ([label, root]) =>
                new DecoGauge(root, {
                    label,
                    unit: "Mb",
                    max: NET_BASE_MAX,
                    zones: netZones(NET_BASE_MAX),
                    format: round,
                })
        );
    }

    #buildDefault() {
        this.#cpuCluster = new GaugeCluster(this.#roots.cpu, {
            id: "cpu",
            title: "CPU",
            summary: { label: "CPU", unit: "%", max: 100, format: round },
            members: [{}],
        });
        this.#tempPlacard = buildUnavailableSection(
            this.#roots.temp,
            "Temperature",
            "awaiting connection"
        );
        this.#ramGauge = new DecoGauge(this.#roots.ram, {
            label: "RAM",
            unit: "%",
            max: 100,
            format: round,
        });
        this.#netGauges = this.#buildNetGauges();
        this.#storageCluster = new GaugeCluster(this.#roots.storage, {
            id: "storage",
            title: "Storage",
            summary: { label: "Disk", unit: "%", max: 100, format: round },
            members: [{}],
        });
    }

    #teardown() {
        this.#clusters().forEach((c) => c.destroy());
        this.#gauges().forEach((g) => g.destroy());
        if (this.#tempPlacard) {
            this.#tempPlacard.remove();
        }
        this.#cpuCluster =
            this.#tempCluster =
            this.#storageCluster =
            this.#ramGauge =
            this.#tempPlacard =
                null;
        this.#netGauges = [];
        this.#tempGroups = [];
        this.#cpuDistribution = [];
        this.#diskTempWarnings = [];
        this.#lastDiskTemps = null;
    }
}

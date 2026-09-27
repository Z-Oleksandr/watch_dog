import { DecoGauge } from "../../render/gauge/deco_gauge.js";
import { GaugeCluster } from "../../render/gauge/gauge_cluster.js";
import { percentZones } from "../../render/gauge/drawing.js";
import { getTheme } from "../../util/theme.js";
import { log } from "../../util/logger.js";
import { friendlySensorName } from "./sensor_names.js";

const NET_BASE_MAX = 500;
const NET_WIDE_MAX = 1000;
const NET_TEST_KBPS = 999_000;
const TEMP_FALLBACK_CRITICAL = 105;
const MOBILE_BREAKPOINT_PX = 768;
const MAX_CPU_CLUSTERS_DESKTOP = 4;
const MAX_CPU_CLUSTERS_MOBILE = 2;
const MAX_LABEL_CHARS = 14;

const round = (v) => Math.round(v);

function distributeThreads(total, clusters) {
    const base = Math.floor(total / clusters);
    const remainder = total % clusters;
    return Array.from({ length: clusters }, (_, i) => base + (i < remainder ? 1 : 0));
}

function tempZones(critical) {
    const theme = getTheme();
    return [
        { from: 0, to: 0.7 * critical, color: theme.emerald },
        { from: 0.7 * critical, to: 0.85 * critical, color: theme.amber },
        { from: 0.85 * critical, to: critical, color: theme.ruby },
    ];
}

function netZones(max) {
    const theme = getTheme();
    if (max <= NET_BASE_MAX) {
        return [{ from: 0, to: max, color: theme.emerald }];
    }
    return [
        { from: 0, to: 0.8 * max, color: theme.emerald },
        { from: 0.8 * max, to: 0.9 * max, color: theme.amber },
        { from: 0.9 * max, to: max, color: theme.ruby },
    ];
}

/** Groups sensors like "coretemp Core 0..7" into one gauge per group. */
export function groupSensors(sensors) {
    const groups = new Map();
    sensors.forEach((sensor, index) => {
        const name = sensor.label.replace(/[\s_-]*\d+$/, "").trim() || "sensor";
        if (!groups.has(name)) {
            groups.set(name, { name, indices: [], critical: null });
        }
        const group = groups.get(name);
        group.indices.push(index);
        if (sensor.critical && (!group.critical || sensor.critical > group.critical)) {
            group.critical = sensor.critical;
        }
    });

    const result = [...groups.values()];
    const seen = new Map();
    for (const group of result) {
        const base = friendlySensorName(group.name);
        const count = (seen.get(base) || 0) + 1;
        seen.set(base, count);
        group.display = count === 1 ? base : `${base} ${count}`;
    }
    return result;
}

function buildUnavailableSection(container, title, message) {
    const root = document.createElement("section");
    root.className = "deco-cluster";
    const header = document.createElement("header");
    header.className = "cluster-header";
    const chevronL = document.createElement("span");
    chevronL.className = "cluster-chevrons";
    const heading = document.createElement("h2");
    heading.textContent = title;
    const chevronR = document.createElement("span");
    chevronR.className = "cluster-chevrons";
    header.append(chevronL, heading, chevronR);
    const note = document.createElement("p");
    note.className = "cluster-unavailable";
    const noteText = document.createElement("span");
    noteText.textContent = message;
    note.appendChild(noteText);
    root.append(header, note);
    container.appendChild(root);
    return root;
}

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
            const hottestCritical = Math.max(
                ...this.#tempGroups.map((g) => g.critical || TEMP_FALLBACK_CRITICAL)
            );
            this.#tempCluster = new GaugeCluster(this.#roots.temp, {
                id: "temp",
                title: "Temperature",
                summary: {
                    label: "Hottest",
                    unit: "°",
                    max: hottestCritical,
                    zones: tempZones(hottestCritical),
                    aggregate: "max",
                    format: round,
                },
                members: this.#tempGroups.map((group) => {
                    const critical = group.critical || TEMP_FALLBACK_CRITICAL;
                    const label = group.display;
                    return {
                        label:
                            label.length > MAX_LABEL_CHARS
                                ? `${label.slice(0, MAX_LABEL_CHARS - 1)}…`
                                : label,
                        unit: "°",
                        max: critical,
                        zones: tempZones(critical),
                        format: round,
                    };
                }),
            });
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
    }
}

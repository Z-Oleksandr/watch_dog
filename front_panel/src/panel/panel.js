import { DecoGauge } from "../deco_gauge/deco_gauge";
import { GaugeCluster } from "../deco_gauge/gauge_cluster";
import { DECO, percentZones } from "../deco_gauge/theme";
import { updateUptime } from "./info_display";

const NET_BASE_MAX = 500;
const NET_WIDE_MAX = 1000;
const TEMP_FALLBACK_CRITICAL = 105;

let cpu_cluster;
let temp_cluster;
let storage_cluster;
let ram_gauge;
let net_gauges = [];
let cpu_distribution = [];
let temp_groups = [];
let net_testing = false;
let initialized = false;
let temp_placard = null;

function distributeThreads(total, clusters) {
    const base = Math.floor(total / clusters);
    const remainder = total % clusters;
    return Array.from({ length: clusters }, (_, i) => base + (i < remainder ? 1 : 0));
}

function tempZones(critical) {
    return [
        { from: 0, to: 0.7 * critical, color: DECO.emerald },
        { from: 0.7 * critical, to: 0.85 * critical, color: DECO.amber },
        { from: 0.85 * critical, to: critical, color: DECO.ruby },
    ];
}

function buildNetGauges() {
    return ["net-down-gauge", "net-up-gauge"].map(
        (id, i) =>
            new DecoGauge(document.getElementById(id), {
                label: i === 0 ? "Down" : "Up",
                unit: "Mb",
                max: NET_BASE_MAX,
                zones: netZones(NET_BASE_MAX),
                format: (v) => Math.round(v),
            })
    );
}

function teardownPanel() {
    [cpu_cluster, temp_cluster, storage_cluster].filter(Boolean).forEach((c) =>
        c.destroy()
    );
    [ram_gauge, ...net_gauges].filter(Boolean).forEach((g) => g.destroy());
    if (temp_placard) temp_placard.remove();
    cpu_cluster = temp_cluster = storage_cluster = ram_gauge = temp_placard = null;
    net_gauges = [];
}

export function initDefaultPanel() {
    cpu_cluster = new GaugeCluster(document.getElementById("cpu-cluster"), {
        id: "cpu",
        title: "CPU",
        summary: { label: "CPU", unit: "%", max: 100, format: (v) => Math.round(v) },
        members: [{}],
    });

    temp_placard = buildUnavailableSection(
        document.getElementById("temp-cluster"),
        "Temperature",
        "awaiting connection"
    );

    ram_gauge = new DecoGauge(document.getElementById("ram-gauge"), {
        label: "RAM",
        unit: "%",
        max: 100,
        format: (v) => Math.round(v),
    });

    net_gauges = buildNetGauges();

    storage_cluster = new GaugeCluster(document.getElementById("storage-cluster"), {
        id: "storage",
        title: "Storage",
        summary: { label: "Disk", unit: "%", max: 100, format: (v) => Math.round(v) },
        members: [{}],
    });
}

function buildUnavailableSection(container, title, message) {
    const root = document.createElement("section");
    root.className = "deco-cluster";
    const header = document.createElement("header");
    header.className = "cluster-header";
    const chevron_l = document.createElement("span");
    chevron_l.className = "cluster-chevrons";
    const heading = document.createElement("h2");
    heading.textContent = title;
    const chevron_r = document.createElement("span");
    chevron_r.className = "cluster-chevrons";
    header.append(chevron_l, heading, chevron_r);
    const note = document.createElement("p");
    note.className = "cluster-unavailable";
    note.textContent = message;
    root.append(header, note);
    container.appendChild(root);
    return root;
}

function groupSensors(sensors) {
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
    return [...groups.values()];
}

function netZones(max) {
    if (max <= NET_BASE_MAX) {
        return [{ from: 0, to: max, color: DECO.emerald }];
    }
    return [
        { from: 0, to: 0.8 * max, color: DECO.emerald },
        { from: 0.8 * max, to: 0.9 * max, color: DECO.amber },
        { from: 0.9 * max, to: max, color: DECO.ruby },
    ];
}

export function initPanel(data) {
    if (initialized) return;
    initialized = true;
    teardownPanel();

    const num_cpus = data.num_cpus;
    const cluster_count = Math.min(window.innerWidth < 768 ? 2 : 4, num_cpus);
    cpu_distribution = distributeThreads(num_cpus, cluster_count);

    let thread_start = 0;
    const cpu_members = cpu_distribution.map((count) => {
        const label =
            count === 1 ? `T${thread_start}` : `T${thread_start}-${thread_start + count - 1}`;
        thread_start += count;
        return { label, unit: "%", max: 100, format: (v) => Math.round(v) };
    });

    cpu_cluster = new GaugeCluster(document.getElementById("cpu-cluster"), {
        id: "cpu",
        title: "CPU",
        summary: { label: "CPU", unit: "%", max: 100, format: (v) => Math.round(v) },
        members: cpu_members,
    });

    const sensors = data.temp_sensors || [];
    const temp_container = document.getElementById("temp-cluster");
    if (sensors.length === 0) {
        temp_placard = buildUnavailableSection(
            temp_container,
            "Temperature",
            "sensors not available"
        );
    } else {
        temp_groups = groupSensors(sensors);
        const hottest_critical = Math.max(
            ...temp_groups.map((g) => g.critical || TEMP_FALLBACK_CRITICAL)
        );
        temp_cluster = new GaugeCluster(temp_container, {
            id: "temp",
            title: "Temperature",
            summary: {
                label: "Hottest",
                unit: "°",
                max: hottest_critical,
                zones: tempZones(hottest_critical),
                aggregate: "max",
                format: (v) => Math.round(v),
            },
            members: temp_groups.map((group) => {
                const critical = group.critical || TEMP_FALLBACK_CRITICAL;
                return {
                    label: group.name.length > 14 ? group.name.slice(0, 13) + "…" : group.name,
                    unit: "°",
                    max: critical,
                    zones: tempZones(critical),
                    format: (v) => Math.round(v),
                };
            }),
        });
    }

    const ram_max = Math.round(data.init_ram_total / 1000);
    ram_gauge = new DecoGauge(document.getElementById("ram-gauge"), {
        label: "RAM",
        unit: "GB",
        max: ram_max,
        zones: percentZones(ram_max),
        format: (v) => Math.round(v),
    });

    net_gauges = buildNetGauges();

    const disk_members = data.disks_space.map((space, i) => ({
        label: `Disk ${i}`,
        unit: "GB",
        max: space,
        zones: percentZones(space),
        format: (v) => Math.round(v),
    }));

    storage_cluster = new GaugeCluster(document.getElementById("storage-cluster"), {
        id: "storage",
        title: "Storage",
        summary:
            disk_members.length === 1
                ? disk_members[0]
                : {
                      label: "Total",
                      unit: "%",
                      max: 100,
                      zones: percentZones(100),
                      aggregate: "sum-ratio",
                      format: (v) => Math.round(v),
                  },
        members: disk_members,
    });
}

export function isPanelInitialized() {
    return initialized;
}

export function updateStats(data) {
    if (!initialized) return;

    const usage = data.cpu_usage;
    let offset = 0;
    const cluster_values = cpu_distribution.map((count) => {
        const slice = usage.slice(offset, offset + count);
        offset += count;
        if (slice.length === 0) return 0;
        return slice.reduce((a, b) => a + b, 0) / slice.length;
    });
    const overall = usage.length
        ? usage.reduce((a, b) => a + b, 0) / usage.length
        : 0;
    cpu_cluster.setValues(cluster_values, overall);

    if (temp_cluster && data.temperatures) {
        const group_values = temp_groups.map((group) => {
            const readings = group.indices
                .map((i) => data.temperatures[i])
                .filter((t) => typeof t === "number");
            return readings.length ? Math.max(...readings) : 0;
        });
        temp_cluster.setValues(group_values);
    }

    ram_gauge.set(data.ram_used / 1000);

    storage_cluster.setValues(data.disks_used_space.map((used) => used / 1000));

    const received = net_testing ? 999000 : data.network_received;
    const transmitted = net_testing ? 999000 : data.network_transmitted;
    [received, transmitted].forEach((kbps, i) => {
        const gauge = net_gauges[i];
        if (kbps > NET_BASE_MAX * 1000 && gauge.maxValue !== NET_WIDE_MAX) {
            gauge.setMax(NET_WIDE_MAX, { zones: netZones(NET_WIDE_MAX) });
        }
        gauge.set(kbps / 1000);
    });

    updateUptime(data.uptime);
}

export function sweepAll() {
    const clusters = [cpu_cluster, temp_cluster, storage_cluster].filter(Boolean);
    clusters.forEach((cluster, i) => setTimeout(() => cluster.sweep(), i * 120));
    [ram_gauge, ...net_gauges].filter(Boolean).forEach((gauge, i) => {
        setTimeout(() => gauge.sweep(), 60 + i * 60);
    });
}

export function zeroAll() {
    [cpu_cluster, temp_cluster, storage_cluster].filter(Boolean).forEach((c) => c.zero());
    [ram_gauge, ...net_gauges].filter(Boolean).forEach((g) => g.set(0));
}

export function setNetTesting(state) {
    net_testing = state;
}

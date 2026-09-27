import { getTheme } from "../../util/theme.js";
import { friendlySensorName } from "./sensor_names.js";

/** Network dials read up to this many Mb/s until traffic exceeds it. */
export const NET_BASE_MAX = 500;

/** Dial range for a sensor that reports no critical value, in °C. */
const TEMP_FALLBACK_CRITICAL = 105;
/** Temperature readouts turn ruby at this, or earlier for sensors with a low critical value. */
const TEMP_ALERT_C = 90;
/** Share of a sensor's critical value where its readout turns ruby; matches the red zone. */
const TEMP_ALERT_RATIO = 0.85;
/** Longest member label that fits under a dial. */
const MAX_LABEL_CHARS = 14;

const round = (v) => Math.round(v);

/** Splits `total` CPU threads into `clusters` near-equal groups. */
export function distributeThreads(total, clusters) {
    const base = Math.floor(total / clusters);
    const remainder = total % clusters;
    return Array.from({ length: clusters }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** Green / amber / red bands at 70 % and 85 % of a sensor's critical value. */
export function tempZones(critical) {
    const theme = getTheme();
    return [
        { from: 0, to: 0.7 * critical, color: theme.emerald },
        { from: 0.7 * critical, to: 0.85 * critical, color: theme.amber },
        { from: 0.85 * critical, to: critical, color: theme.ruby },
    ];
}

/** A plain green band up to the base range; amber and red near a wider maximum. */
export function netZones(max) {
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

/**
 * Where a sensor's readout turns ruby: 90 °C, or the start of its red zone
 * when that comes sooner (an NVMe drive critical at 85 °C alerts at 72 °C).
 * @param {number | null} critical
 */
export function tempAlertAt(critical) {
    return critical ? Math.min(TEMP_ALERT_C, TEMP_ALERT_RATIO * critical) : TEMP_ALERT_C;
}

/**
 * Gauge cluster options for the temperature section: a "Hottest" summary
 * plus one dial per sensor group.
 * @param {ReturnType<typeof groupSensors>} groups
 */
export function tempClusterOptions(groups) {
    const hottestCritical = Math.max(...groups.map((g) => g.critical || TEMP_FALLBACK_CRITICAL));
    return {
        id: "temp",
        title: "Temperature",
        summary: {
            label: "Hottest",
            unit: "°",
            max: hottestCritical,
            zones: tempZones(hottestCritical),
            aggregate: "max",
            format: round,
            // The hottest sensor is not necessarily the one nearest its limit,
            // so the summary alerts whenever any group does. With one group
            // the summary gauge is that group's gauge.
            alertAt: groups.length === 1 ? tempAlertAt(groups[0].critical) : null,
            alertFromMembers: true,
        },
        members: groups.map((group) => {
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
                alertAt: tempAlertAt(group.critical),
            };
        }),
    };
}

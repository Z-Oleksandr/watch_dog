/**
 * Every constant of the simulated engine. Units follow the wire protocol:
 * RAM and used disk space in MB, disk size in GB, network in KB per tick,
 * temperatures in °C, uptime in seconds.
 */

export const DEMO_SOCKET_URL = "demo://simulated-engine";

export const DEMO_NOTICE = "Demo mode: every reading is simulated in your browser";

export const SOCKET_READY_STATE = Object.freeze({
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
});

export const CLOSE_NORMAL = 1000;

/** Delay before a simulated connection opens, like a handshake on a LAN. */
export const OPEN_DELAY_MS = 120;

/** Delay before a reply to a request arrives. */
export const REPLY_DELAY_MS = 60;

/** Matches the engine's `CLIENT_STREAM_DELAY`, which the boot animation waits for. */
export const STREAM_DELAY_MS = 5000;

export const TICK_MS = 1000;

/** The engine records one point per five stats ticks. */
export const RECORDING_TICKS_PER_POINT = 5;

export const SECONDS_PER_HOUR = 3600;

export const SYSTEM_INFO = Object.freeze({
    system_name: "Ubuntu",
    kernel_version: "6.8.0-48-generic",
    cpu_arch: "x86_64",
    os_version: "24.04",
    host_name: "watchdog-demo",
    docker: "27.3.1",
});

export const UPTIME_RANGE_S = Object.freeze({ min: 3 * 86_400, max: 41 * 86_400 });

export const CPU = Object.freeze({
    cores: 8,
    idle: Object.freeze({ min: 2, max: 14 }),
    burstTarget: Object.freeze({ min: 55, max: 98 }),
    burstChance: 0.06,
    settleChance: 0.12,
    response: 0.35,
    jitter: 3,
});

export const RAM = Object.freeze({
    totalMb: 32_000,
    baselineMb: 9_800,
    loadMb: 6_500,
    driftMb: 120,
    response: 0.1,
    minFraction: 0.15,
    maxFraction: 0.92,
});

/**
 * `warningC` is the threshold the engine derives for the drive type; `null`
 * means the disk exposes no temperature sensor.
 */
export const DISKS = Object.freeze([
    Object.freeze({ sizeGb: 1000, usedFraction: 0.46, warningC: 70, idleC: 39 }),
    Object.freeze({ sizeGb: 2000, usedFraction: 0.63, warningC: 70, idleC: 33 }),
    Object.freeze({ sizeGb: 4000, usedFraction: 0.71, warningC: 55, idleC: 36 }),
    Object.freeze({ sizeGb: 500, usedFraction: 0.28, warningC: null, idleC: null }),
]);

export const DISK_ACTIVITY = Object.freeze({
    growthMbPerTick: Object.freeze({ min: 0, max: 18 }),
    cleanupChance: 0.004,
    cleanupFraction: 0.01,
    temperatureLoadC: 7,
    temperatureResponse: 0.02,
    temperatureJitter: 0.15,
});

/** `loadC` is how far above idle the sensor sits at 100 % CPU. */
export const TEMP_SENSORS = Object.freeze([
    Object.freeze({ label: "coretemp Package id 0", critical: 100, idleC: 41, loadC: 44 }),
    Object.freeze({ label: "coretemp Core 0", critical: 100, idleC: 39, loadC: 46 }),
    Object.freeze({ label: "coretemp Core 1", critical: 100, idleC: 40, loadC: 45 }),
    Object.freeze({ label: "nvme Composite", critical: 84, idleC: 37, loadC: 18 }),
    Object.freeze({ label: "acpitz temp1", critical: 98, idleC: 34, loadC: 12 }),
    Object.freeze({ label: "iwlwifi_1 temp1", critical: null, idleC: 36, loadC: 6 }),
]);

export const TEMPERATURE_RESPONSE = 0.12;

export const TEMPERATURE_JITTER_C = 0.3;

export const NETWORK = Object.freeze({
    idleDownKb: Object.freeze({ min: 8, max: 260 }),
    idleUpKb: Object.freeze({ min: 4, max: 120 }),
    burstDownKb: Object.freeze({ min: 18_000, max: 160_000 }),
    burstUpKb: Object.freeze({ min: 4_000, max: 45_000 }),
    burstChance: 0.04,
    burstTicks: Object.freeze({ min: 4, max: 16 }),
    burstJitter: 0.25,
});

/** Historical recordings available before the visitor records anything. */
export const SEEDED_RECORDINGS = Object.freeze([
    Object.freeze({ daysAgo: 6, hours: 2 }),
    Object.freeze({ daysAgo: 3, hours: 6 }),
    Object.freeze({ daysAgo: 1, hours: 1 }),
]);

export const CONTAINER_TAIL_LINES = 100;

export const CONTAINER_LINE_INTERVAL_MS = Object.freeze({ min: 400, max: 4500 });

export const CONTAINER_NAMES = Object.freeze([
    "reverse-proxy",
    "blog",
    "postgres",
    "redis",
    "nightly-backup",
]);

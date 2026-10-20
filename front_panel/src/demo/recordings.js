import { DATA_TYPE } from "../protocol/messages.js";
import { RECORDING_TICKS_PER_POINT, SECONDS_PER_HOUR, SEEDED_RECORDINGS } from "./config.js";
import { SimulatedMachine } from "./machine.js";

const MS_PER_SECOND = 1000;
const MS_PER_DAY = 86_400_000;
const PERCENT_DECIMALS = 100;

const pad = (value) => String(value).padStart(2, "0");

function datePart(date) {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** The engine's file stamp, `%Y-%m-%d_%H-%M-%S` in UTC. */
export function fileStamp(date) {
    const time = [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()].map(pad);
    return `${datePart(date)}_${time.join("-")}`;
}

/** The engine's point stamp, `%Y-%m-%dT%H:%M:%S` in UTC. */
export function pointStamp(date) {
    const time = [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()].map(pad);
    return `${datePart(date)}T${time.join(":")}`;
}

/**
 * One recorded session. Collects stats ticks and, like the engine's recorder,
 * stores a point every five: mean CPU, latest RAM, summed network.
 */
class Recording {
    name;
    cpu = [];
    ram = [];
    down = [];
    up = [];
    #remainingTicks;
    #window = { cpuTotal: 0, ticks: 0, down: 0, up: 0, ram: 0 };

    constructor(startedAt, durationTicks) {
        this.name = `log_${fileStamp(startedAt)}`;
        this.#remainingTicks = durationTicks;
    }

    get isActive() {
        return this.#remainingTicks > 0;
    }

    /** @param {object} stats  A `data_type` 1 frame. */
    push(stats, at) {
        if (!this.isActive) return;
        const window = this.#window;
        window.cpuTotal += stats.cpu_usage.reduce((s, v) => s + v, 0) / stats.cpu_usage.length;
        window.ticks += 1;
        window.down += stats.network_received;
        window.up += stats.network_transmitted;
        window.ram = stats.ram_used;
        this.#remainingTicks -= 1;
        if (window.ticks === RECORDING_TICKS_PER_POINT || !this.isActive) {
            this.#flush(at);
        }
    }

    #flush(at) {
        const window = this.#window;
        const time_stamp = pointStamp(at);
        const cpu = Math.round((window.cpuTotal / window.ticks) * PERCENT_DECIMALS);
        this.cpu.push({ time_stamp, value: cpu / PERCENT_DECIMALS });
        this.ram.push({ time_stamp, value: window.ram });
        this.down.push({ time_stamp, value: window.down });
        this.up.push({ time_stamp, value: window.up });
        this.#window = { cpuTotal: 0, ticks: 0, down: 0, up: 0, ram: 0 };
    }
}

/**
 * The simulated log directory: a few historical recordings plus whatever the
 * visitor records with `start_log`. Indices are stable, oldest first, so the
 * last index is always the latest recording.
 */
export class RecordingStore {
    #random;
    #now;
    #recordings = null;

    /**
     * @param {object} options
     * @param {import("./random.js").Random} options.random
     * @param {() => number} [options.now]  Wall clock in ms.
     */
    constructor({ random, now = Date.now }) {
        this.#random = random;
        this.#now = now;
    }

    /**
     * Starts a recording of the next `hours` of live ticks. Like the engine,
     * only one recording runs at a time.
     * @returns {boolean} false when one is already running.
     */
    start(hours) {
        const recordings = this.#all();
        if (recordings.some((recording) => recording.isActive)) {
            return false;
        }
        const startedAt = new Date(this.#now());
        recordings.push(new Recording(startedAt, hours * SECONDS_PER_HOUR));
        return true;
    }

    /** Feeds one live stats frame to the running recording, if any. */
    record(stats) {
        const active = this.#recordings?.find((recording) => recording.isActive);
        active?.push(stats, new Date(this.#now()));
    }

    /** The `data_type` 3 frame. */
    listFrame() {
        const log_list = {};
        this.#all().forEach((recording, index) => {
            log_list[index] = recording.name;
        });
        return { data_type: DATA_TYPE.LOG_LIST, log_list };
    }

    /**
     * The `data_type` 4 frame for one recording.
     * @returns {object | null} null for an unknown index, which the engine ignores too.
     */
    dataFrame(index) {
        const recording = this.#all()[index];
        if (!recording) return null;
        return {
            data_type: DATA_TYPE.LOG_DATA,
            cnr_data: { cpu: [...recording.cpu], ram: [...recording.ram] },
            net_data: { network: { down: [...recording.down], up: [...recording.up] } },
        };
    }

    #all() {
        if (this.#recordings === null) {
            this.#recordings = SEEDED_RECORDINGS.map((seed) => this.#history(seed));
        }
        return this.#recordings;
    }

    #history({ daysAgo, hours }) {
        const machine = new SimulatedMachine(this.#random.fork());
        const startMs = this.#now() - daysAgo * MS_PER_DAY;
        const ticks = hours * SECONDS_PER_HOUR;
        const recording = new Recording(new Date(startMs), ticks);
        for (let second = 1; second <= ticks; second += 1) {
            recording.push(machine.tick(), new Date(startMs + second * MS_PER_SECOND));
        }
        return recording;
    }
}

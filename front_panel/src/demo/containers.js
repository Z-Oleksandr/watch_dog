import { CHANNEL_SEPARATOR } from "../protocol/channels.js";
import { DATA_TYPE } from "../protocol/messages.js";
import { CONTAINER_LINE_INTERVAL_MS, CONTAINER_NAMES, CONTAINER_TAIL_LINES } from "./config.js";
import { containerLogLine } from "./container_logs.js";

/**
 * Splits a `start_container_output` message into container index and output
 * channel, exactly as the engine's `get_index_and_channel` does.
 * @param {number} message
 * @returns {{ index: number, channel: number } | null}
 */
export function decodeStreamRequest(message) {
    const text = String(message);
    const position = text.indexOf(CHANNEL_SEPARATOR);
    if (position === -1) return null;
    const indexPart = text.slice(0, position);
    const channelPart = text.slice(position + CHANNEL_SEPARATOR.length);
    const index = indexPart === "" ? 0 : Number(indexPart);
    const channel = channelPart === "" ? 0 : Number(channelPart);
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(channel)) return null;
    return { index, channel };
}

/** The `data_type` 5 frame. */
export function containerListFrame() {
    const list = {};
    CONTAINER_NAMES.forEach((name, index) => {
        list[index] = name;
    });
    return { data_type: DATA_TYPE.CONTAINER_LIST, list };
}

/**
 * The container output streams of one connection. Like the engine, a stream
 * sends the last lines of the log first and then follows it until stopped.
 */
export class ContainerStreams {
    #random;
    #emit;
    #now;
    #timers = new Map();

    /**
     * @param {object} options
     * @param {import("./random.js").Random} options.random
     * @param {(frame: object) => void} options.emit
     * @param {() => number} [options.now]  Wall clock in ms.
     */
    constructor({ random, emit, now = Date.now }) {
        this.#random = random;
        this.#emit = emit;
        this.#now = now;
    }

    /**
     * @param {number} message  The encoded `<index>99899<channel>` request.
     * @returns {boolean} false when the request names no known container.
     */
    start(message) {
        const decoded = decodeStreamRequest(message);
        const name = decoded ? CONTAINER_NAMES[decoded.index] : undefined;
        if (!decoded || name === undefined) return false;
        this.stop(decoded.channel);
        this.#sendTail(name, decoded.channel);
        this.#scheduleNext(name, decoded.channel);
        return true;
    }

    /** @param {number} channel */
    stop(channel) {
        clearTimeout(this.#timers.get(channel));
        this.#timers.delete(channel);
    }

    stopAll() {
        [...this.#timers.keys()].forEach((channel) => this.stop(channel));
    }

    get activeChannels() {
        return [...this.#timers.keys()];
    }

    #sendTail(name, channel) {
        const gaps = Array.from({ length: CONTAINER_TAIL_LINES }, () => this.#interval());
        let at = this.#now() - gaps.reduce((sum, gap) => sum + gap, 0);
        for (const gap of gaps) {
            at += gap;
            this.#emitLine(name, channel, new Date(at));
        }
    }

    #scheduleNext(name, channel) {
        const timer = setTimeout(() => {
            this.#emitLine(name, channel, new Date(this.#now()));
            this.#scheduleNext(name, channel);
        }, this.#interval());
        this.#timers.set(channel, timer);
    }

    #emitLine(name, channel, date) {
        this.#emit({ data_type: channel, log_line: containerLogLine(name, this.#random, date) });
    }

    #interval() {
        return this.#random.int(CONTAINER_LINE_INTERVAL_MS.min, CONTAINER_LINE_INTERVAL_MS.max);
    }
}

import { REQUEST_TYPE } from "../protocol/messages.js";
import { TICK_MS } from "./config.js";
import { containerListFrame } from "./containers.js";
import { SimulatedMachine } from "./machine.js";
import { Random, randomSeed } from "./random.js";
import { RecordingStore } from "./recordings.js";

/**
 * @typedef {object} SimulatedConnection
 * @property {(frame: object) => void} reply
 * @property {import("./containers.js").ContainerStreams} streams
 */

/**
 * The in-browser stand-in for the engine process: one machine, one log
 * directory and one sampler shared by every connection of this page, so a
 * reconnect sees the same host, uptime and recordings.
 */
export class SimulatedEngine {
    #random;
    #machine;
    #recordings;
    #subscribers = new Set();
    #sampler = null;
    #handlers;

    /**
     * @param {object} [options]
     * @param {Random} [options.random]
     * @param {() => number} [options.now]  Wall clock in ms.
     */
    constructor({ random = new Random(randomSeed()), now = Date.now } = {}) {
        this.#random = random;
        this.#machine = new SimulatedMachine(random.fork());
        this.#recordings = new RecordingStore({ random: random.fork(), now });
        this.#handlers = Object.freeze({
            [REQUEST_TYPE.START_LOG]: (hours) => hours > 0 && this.#recordings.start(hours),
            [REQUEST_TYPE.GET_LOG_LIST]: (_message, connection) =>
                connection.reply(this.#recordings.listFrame()),
            [REQUEST_TYPE.GET_LOG_DATA]: (index, connection) => {
                const frame = this.#recordings.dataFrame(index);
                if (frame) connection.reply(frame);
            },
            [REQUEST_TYPE.GET_CONTAINERS]: (_message, connection) =>
                connection.reply(containerListFrame()),
            [REQUEST_TYPE.START_CONTAINER_OUTPUT]: (message, connection) =>
                connection.streams.start(message),
            [REQUEST_TYPE.STOP_CONTAINER_OUTPUT]: (channel, connection) =>
                connection.streams.stop(channel),
        });
    }

    /** A source for per-connection randomness, derived from the engine's seed. */
    forkRandom() {
        return this.#random.fork();
    }

    /** The frames the engine sends right after a handshake: topology, then system info. */
    greeting() {
        return [this.#machine.topology(), this.#machine.systemInfo()];
    }

    /**
     * Receives every stats frame from now on. The sampler runs only while
     * someone listens, as the engine samples only while clients are connected.
     * @param {(frame: object) => void} listener
     */
    subscribe(listener) {
        this.#subscribers.add(listener);
        if (this.#sampler === null) {
            this.#sampler = setInterval(() => this.#tick(), TICK_MS);
        }
    }

    /** @param {(frame: object) => void} listener */
    unsubscribe(listener) {
        this.#subscribers.delete(listener);
        if (this.#subscribers.size === 0 && this.#sampler !== null) {
            clearInterval(this.#sampler);
            this.#sampler = null;
        }
    }

    /**
     * Answers one validated request, as the engine's `ws::read` dispatcher does.
     * @param {{ type: string, message: number }} request
     * @param {SimulatedConnection} connection
     */
    handle({ type, message }, connection) {
        this.#handlers[type]?.(message, connection);
    }

    #tick() {
        const frame = this.#machine.tick();
        this.#recordings.record(frame);
        this.#subscribers.forEach((listener) => listener(frame));
    }
}

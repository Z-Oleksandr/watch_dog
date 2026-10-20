import { isRequestType, isValidMessageValue } from "../protocol/messages.js";
import { log } from "../util/logger.js";
import {
    CLOSE_NORMAL,
    DEMO_NOTICE,
    DEMO_SOCKET_URL,
    OPEN_DELAY_MS,
    REPLY_DELAY_MS,
    SOCKET_READY_STATE,
    STREAM_DELAY_MS,
} from "./config.js";
import { ContainerStreams } from "./containers.js";
import { SimulatedEngine } from "./engine.js";

/**
 * Parses a request the way the engine does: JSON `{ type, message }` with a
 * known type and a non-negative integer message.
 * @returns {{ type: string, message: number } | null}
 */
export function parseRequest(data) {
    if (typeof data !== "string") return null;
    let request;
    try {
        request = JSON.parse(data);
    } catch (err) {
        log.debug("demo", "ignoring unparseable request", { err });
        return null;
    }
    if (request === null || typeof request !== "object") return null;
    const { type, message } = request;
    return isRequestType(type) && isValidMessageValue(message) ? { type, message } : null;
}

/**
 * Builds a WebSocket-compatible class bound to one simulated engine. The
 * transport constructs it with a URL exactly as it would a real `WebSocket`,
 * and receives the engine's frames as JSON text, so everything above the
 * transport runs unchanged.
 *
 * @param {SimulatedEngine} engine
 * @returns {typeof WebSocket}
 */
export function createSimulatedSocketClass(engine) {
    return class SimulatedEngineSocket {
        static CONNECTING = SOCKET_READY_STATE.CONNECTING;
        static OPEN = SOCKET_READY_STATE.OPEN;
        static CLOSING = SOCKET_READY_STATE.CLOSING;
        static CLOSED = SOCKET_READY_STATE.CLOSED;

        url;
        readyState = SOCKET_READY_STATE.CONNECTING;
        onopen = null;
        onmessage = null;
        onerror = null;
        onclose = null;
        #timers = new Set();
        #streams;
        #statsListener = (frame) => this.#deliver(frame);

        constructor(url) {
            this.url = url;
            this.#streams = new ContainerStreams({
                random: engine.forkRandom(),
                emit: (frame) => this.#deliver(frame),
            });
            this.#later(() => this.#open(), OPEN_DELAY_MS);
        }

        /** @param {string} data */
        send(data) {
            if (this.readyState === SOCKET_READY_STATE.CONNECTING) {
                throw new Error("simulated socket is still connecting");
            }
            if (this.readyState !== SOCKET_READY_STATE.OPEN) return;
            const request = parseRequest(data);
            if (!request) {
                log.debug("demo", "ignoring malformed request");
                return;
            }
            const connection = { reply: (frame) => this.#deliver(frame), streams: this.#streams };
            this.#later(() => engine.handle(request, connection), REPLY_DELAY_MS);
        }

        close(code = CLOSE_NORMAL, reason = "") {
            if (this.readyState >= SOCKET_READY_STATE.CLOSING) return;
            this.readyState = SOCKET_READY_STATE.CLOSING;
            this.#teardown();
            setTimeout(() => {
                this.readyState = SOCKET_READY_STATE.CLOSED;
                this.onclose?.({ code, reason, wasClean: true });
            }, 0);
        }

        #open() {
            this.readyState = SOCKET_READY_STATE.OPEN;
            this.onopen?.({});
            engine.greeting().forEach((frame) => this.#deliver(frame));
            this.#later(() => engine.subscribe(this.#statsListener), STREAM_DELAY_MS);
        }

        #deliver(frame) {
            if (this.readyState !== SOCKET_READY_STATE.OPEN) return;
            this.onmessage?.({ data: JSON.stringify(frame) });
        }

        #later(fn, delayMs) {
            const timer = setTimeout(() => {
                this.#timers.delete(timer);
                fn();
            }, delayMs);
            this.#timers.add(timer);
        }

        #teardown() {
            this.#timers.forEach((timer) => clearTimeout(timer));
            this.#timers.clear();
            this.#streams.stopAll();
            engine.unsubscribe(this.#statsListener);
        }
    };
}

/**
 * Transport options for the demo build: a fresh simulated engine for this
 * page and the socket class that talks to it.
 * @returns {{ url: string, WebSocketImpl: typeof WebSocket }}
 */
export function simulatedTransportOptions() {
    return {
        url: DEMO_SOCKET_URL,
        WebSocketImpl: createSimulatedSocketClass(new SimulatedEngine()),
    };
}

export { DEMO_NOTICE };

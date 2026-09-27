import { encodeRequest } from "../protocol/messages.js";
import { isDocumentHidden } from "../util/device.js";
import { log } from "../util/logger.js";

export const STATE = Object.freeze({
    IDLE: "idle",
    CONNECTING: "connecting",
    OPEN: "open",
    CLOSING: "closing",
    CLOSED: "closed",
});

const CLOSE_NORMAL = 1000;
const CLOSE_GOING_AWAY = 1001;

export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 30_000;
export const RECONNECT_JITTER = 0.2;

/** Deterministic part of the backoff; jitter is applied by the caller. */
export function backoffDelay(attempt, random = Math.random) {
    const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.max(0, attempt));
    const spread = 1 - RECONNECT_JITTER + random() * 2 * RECONNECT_JITTER;
    return Math.round(exp * spread);
}

/**
 * Owns the one WebSocket to the engine.
 *
 * Events (all `CustomEvent`s):
 * - `statechange`  detail: { state, previous, closeCode, closeReason }
 * - `message`      detail: raw text of one frame
 * - `reconnect`    detail: { attempt, delayMs }
 * - `dropped`      detail: { type, state }  (a send that could not go out)
 */
export class Transport extends EventTarget {
    #url;
    #WebSocketImpl;
    #socket = null;
    #state = STATE.IDLE;
    #attempt = 0;
    #reconnectTimer = null;
    #intentionalClose = false;
    #abort = new AbortController();
    #random;

    /**
     * @param {object} options
     * @param {string} options.url
     * @param {typeof WebSocket} [options.WebSocketImpl]
     * @param {() => number} [options.random]
     */
    constructor({ url, WebSocketImpl = globalThis.WebSocket, random = Math.random }) {
        super();
        this.#url = url;
        this.#WebSocketImpl = WebSocketImpl;
        this.#random = random;

        if (globalThis.document) {
            document.addEventListener("visibilitychange", () => this.#onVisibilityChange(), {
                signal: this.#abort.signal,
            });
        }
    }

    get state() {
        return this.#state;
    }

    get url() {
        return this.#url;
    }

    get isOpen() {
        return this.#state === STATE.OPEN;
    }

    get attempt() {
        return this.#attempt;
    }

    connect() {
        if (this.#state === STATE.CONNECTING || this.#state === STATE.OPEN) {
            return;
        }
        this.#clearReconnectTimer();
        this.#intentionalClose = false;

        let socket;
        try {
            socket = new this.#WebSocketImpl(this.#url);
        } catch (err) {
            log.error("transport", "could not create socket", { url: this.#url, err });
            this.#setState(STATE.CLOSED, { closeCode: null, closeReason: "constructor" });
            this.#scheduleReconnect();
            return;
        }
        this.#socket = socket;
        this.#setState(STATE.CONNECTING);

        socket.onopen = () => {
            if (socket !== this.#socket) return;
            this.#attempt = 0;
            this.#setState(STATE.OPEN);
        };
        socket.onmessage = (event) => {
            if (socket !== this.#socket) return;
            if (typeof event.data !== "string") {
                log.debug("transport", "ignoring non-text frame");
                return;
            }
            this.dispatchEvent(new CustomEvent("message", { detail: event.data }));
        };
        socket.onerror = () => {
            if (socket !== this.#socket) return;
            // The close event that follows carries the useful detail.
            log.debug("transport", "socket error");
        };
        socket.onclose = (event) => {
            if (socket !== this.#socket) return;
            this.#socket = null;
            const expected = event.code === CLOSE_NORMAL || event.code === CLOSE_GOING_AWAY;
            const level = expected || this.#intentionalClose ? "info" : "warn";
            log[level]("transport", "socket closed", { code: event.code, reason: event.reason });
            this.#setState(STATE.CLOSED, { closeCode: event.code, closeReason: event.reason });
            if (!this.#intentionalClose) {
                this.#scheduleReconnect();
            }
        };
    }

    /**
     * Closes the socket without scheduling a reconnect.
     * @param {string} [reason]
     */
    disconnect(reason = "client closing") {
        this.#intentionalClose = true;
        this.#clearReconnectTimer();
        const socket = this.#socket;
        if (!socket) {
            if (this.#state !== STATE.CLOSED) {
                this.#setState(STATE.CLOSED, { closeCode: null, closeReason: reason });
            }
            return;
        }
        this.#setState(STATE.CLOSING);
        try {
            socket.close(CLOSE_NORMAL, reason);
        } catch (err) {
            log.warn("transport", "close threw", { err });
            this.#socket = null;
            this.#setState(STATE.CLOSED, { closeCode: null, closeReason: reason });
        }
    }

    /** Operator-initiated reset: close now, reconnect right away. */
    reconnect() {
        this.#clearReconnectTimer();
        this.#attempt = 0;
        const socket = this.#socket;
        if (socket) {
            this.#intentionalClose = true;
            this.#socket = null;
            socket.onclose = null;
            socket.onmessage = null;
            socket.onerror = null;
            socket.onopen = null;
            try {
                socket.close(CLOSE_NORMAL, "reset");
            } catch {
                // Already closing; nothing to do.
            }
            this.#setState(STATE.CLOSED, { closeCode: CLOSE_NORMAL, closeReason: "reset" });
        }
        this.connect();
    }

    /**
     * @param {string} type  A REQUEST_TYPE.
     * @param {number} message
     * @returns {boolean} false when the request was dropped.
     */
    send(type, message) {
        const payload = encodeRequest(type, message);
        if (payload === null) {
            log.error("transport", "refusing malformed request", { type, message });
            return false;
        }
        if (!this.isOpen || !this.#socket) {
            log.warn("transport", "dropped request, socket not open", { type, state: this.#state });
            this.dispatchEvent(
                new CustomEvent("dropped", { detail: { type, state: this.#state } })
            );
            return false;
        }
        try {
            this.#socket.send(payload);
            return true;
        } catch (err) {
            log.error("transport", "send failed", { type, err });
            return false;
        }
    }

    /** Releases listeners; the instance is unusable afterwards. */
    destroy() {
        this.disconnect("destroyed");
        this.#abort.abort();
    }

    #setState(state, extra = {}) {
        const previous = this.#state;
        if (previous === state && !extra.closeCode) {
            return;
        }
        this.#state = state;
        this.dispatchEvent(
            new CustomEvent("statechange", { detail: { state, previous, ...extra } })
        );
    }

    #scheduleReconnect() {
        if (this.#reconnectTimer !== null) {
            return;
        }
        if (isDocumentHidden()) {
            log.info("transport", "page hidden, reconnect deferred until visible");
            return;
        }
        const delayMs = backoffDelay(this.#attempt, this.#random);
        this.#attempt += 1;
        const attempt = this.#attempt;
        log.info("transport", "reconnect scheduled", { attempt, delayMs });
        this.dispatchEvent(new CustomEvent("reconnect", { detail: { attempt, delayMs } }));
        this.#reconnectTimer = setTimeout(() => {
            this.#reconnectTimer = null;
            this.connect();
        }, delayMs);
    }

    #clearReconnectTimer() {
        if (this.#reconnectTimer !== null) {
            clearTimeout(this.#reconnectTimer);
            this.#reconnectTimer = null;
        }
    }

    #onVisibilityChange() {
        if (isDocumentHidden()) {
            return;
        }
        if (
            this.#state === STATE.CLOSED &&
            !this.#intentionalClose &&
            this.#reconnectTimer === null
        ) {
            log.info("transport", "page visible, reconnecting");
            this.connect();
        }
    }
}

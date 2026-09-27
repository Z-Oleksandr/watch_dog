import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REQUEST_TYPE } from "../protocol/messages.js";
import { STATE, Transport, backoffDelay } from "./socket.js";

class FakeSocket {
    static instances = [];
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url) {
        this.url = url;
        this.sent = [];
        this.closed = null;
        this.readyState = FakeSocket.CONNECTING;
        FakeSocket.instances.push(this);
    }
    open() {
        this.readyState = FakeSocket.OPEN;
        this.onopen && this.onopen({});
    }
    receive(text) {
        this.onmessage && this.onmessage({ data: text });
    }
    send(payload) {
        this.sent.push(payload);
    }
    close(code = 1000, reason = "") {
        this.closed = { code, reason };
        this.readyState = FakeSocket.CLOSED;
        this.onclose && this.onclose({ code, reason });
    }
    fail(code = 1006) {
        this.readyState = FakeSocket.CLOSED;
        this.onclose && this.onclose({ code, reason: "" });
    }
}

function build() {
    const states = [];
    const transport = new Transport({
        url: "ws://x/ws",
        WebSocketImpl: FakeSocket,
        random: () => 0.5,
    });
    transport.addEventListener("statechange", (e) => states.push(e.detail.state));
    return { transport, states };
}

describe("Transport", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        FakeSocket.instances = [];
    });
    afterEach(() => vi.useRealTimers());

    it("walks_idle_connecting_open", () => {
        const { transport, states } = build();
        expect(transport.state).toBe(STATE.IDLE);
        transport.connect();
        FakeSocket.instances[0].open();
        expect(states).toEqual([STATE.CONNECTING, STATE.OPEN]);
        expect(transport.isOpen).toBe(true);
    });

    it("drops_sends_while_not_open", () => {
        const { transport } = build();
        const dropped = vi.fn();
        transport.addEventListener("dropped", dropped);
        expect(transport.send(REQUEST_TYPE.GET_LOG_LIST, 0)).toBe(false);
        expect(dropped).toHaveBeenCalledTimes(1);
        transport.connect();
        expect(transport.send(REQUEST_TYPE.GET_LOG_LIST, 0)).toBe(false);
        FakeSocket.instances[0].open();
        expect(transport.send(REQUEST_TYPE.GET_LOG_LIST, 0)).toBe(true);
        expect(FakeSocket.instances[0].sent).toEqual(['{"type":"get_log_list","message":0}']);
    });

    it("refuses_malformed_requests_even_when_open", () => {
        const { transport } = build();
        transport.connect();
        FakeSocket.instances[0].open();
        expect(transport.send("bogus", 1)).toBe(false);
        expect(transport.send(REQUEST_TYPE.START_LOG, -3)).toBe(false);
        expect(FakeSocket.instances[0].sent).toEqual([]);
    });

    it("emits_received_text_frames", () => {
        const { transport } = build();
        const received = [];
        transport.addEventListener("message", (e) => received.push(e.detail));
        transport.connect();
        FakeSocket.instances[0].open();
        FakeSocket.instances[0].receive('{"data_type":1}');
        expect(received).toEqual(['{"data_type":1}']);
    });

    it("reconnects_with_exponential_backoff_after_an_unexpected_close", () => {
        const { transport } = build();
        const scheduled = [];
        transport.addEventListener("reconnect", (e) => scheduled.push(e.detail));
        transport.connect();
        FakeSocket.instances[0].open();
        FakeSocket.instances[0].fail();
        expect(transport.state).toBe(STATE.CLOSED);
        expect(scheduled).toEqual([{ attempt: 1, delayMs: 1000 }]);
        expect(FakeSocket.instances).toHaveLength(1);

        vi.advanceTimersByTime(1000);
        expect(FakeSocket.instances).toHaveLength(2);
        FakeSocket.instances[1].fail();
        expect(scheduled[1]).toEqual({ attempt: 2, delayMs: 2000 });

        vi.advanceTimersByTime(2000);
        FakeSocket.instances[2].open();
        expect(transport.attempt).toBe(0);
    });

    it("does_not_reconnect_after_an_intentional_disconnect", () => {
        const { transport } = build();
        transport.connect();
        FakeSocket.instances[0].open();
        transport.disconnect("bye");
        expect(FakeSocket.instances[0].closed).toEqual({ code: 1000, reason: "bye" });
        expect(transport.state).toBe(STATE.CLOSED);
        vi.advanceTimersByTime(60_000);
        expect(FakeSocket.instances).toHaveLength(1);
    });

    it("reconnect_closes_the_old_socket_before_opening_a_new_one", () => {
        const { transport } = build();
        transport.connect();
        FakeSocket.instances[0].open();
        transport.reconnect();
        expect(FakeSocket.instances[0].closed.code).toBe(1000);
        expect(FakeSocket.instances).toHaveLength(2);
        expect(transport.state).toBe(STATE.CONNECTING);
        // Late events from the old socket are ignored.
        FakeSocket.instances[0].fail();
        expect(transport.state).toBe(STATE.CONNECTING);
    });

    it("ignores_connect_while_already_connecting", () => {
        const { transport } = build();
        transport.connect();
        transport.connect();
        expect(FakeSocket.instances).toHaveLength(1);
    });
});

describe("backoffDelay", () => {
    it("doubles_and_caps", () => {
        const fixed = () => 0.5;
        expect(backoffDelay(0, fixed)).toBe(1000);
        expect(backoffDelay(3, fixed)).toBe(8000);
        expect(backoffDelay(10, fixed)).toBe(30_000);
    });

    it("applies_jitter_within_twenty_percent", () => {
        expect(backoffDelay(0, () => 0)).toBe(800);
        expect(backoffDelay(0, () => 1)).toBe(1200);
    });
});

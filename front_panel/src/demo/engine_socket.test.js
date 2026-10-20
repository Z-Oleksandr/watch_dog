import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeStreamRequest } from "../protocol/channels.js";
import { DATA_TYPE, REQUEST_TYPE, encodeRequest, parseFrame } from "../protocol/messages.js";
import { STATE, Transport } from "../transport/socket.js";
import {
    DEMO_SOCKET_URL,
    OPEN_DELAY_MS,
    REPLY_DELAY_MS,
    SEEDED_RECORDINGS,
    STREAM_DELAY_MS,
    TICK_MS,
} from "./config.js";
import { SimulatedEngine } from "./engine.js";
import {
    createSimulatedSocketClass,
    parseRequest,
    simulatedTransportOptions,
} from "./engine_socket.js";
import { Random } from "./random.js";

function connect() {
    const SocketClass = createSimulatedSocketClass(new SimulatedEngine({ random: new Random(3) }));
    const socket = new SocketClass(DEMO_SOCKET_URL);
    const frames = [];
    const events = [];
    socket.onopen = () => events.push("open");
    socket.onclose = (event) => events.push(`close:${event.code}`);
    socket.onmessage = (event) => {
        const parsed = parseFrame(event.data);
        expect(parsed.ok).toBe(true);
        frames.push(parsed.frame);
    };
    return { socket, frames, events };
}

const dataTypes = (frames) => frames.map((f) => f.data_type);

describe("parseRequest", () => {
    it("accepts_engine_requests", () => {
        expect(parseRequest(encodeRequest(REQUEST_TYPE.START_LOG, 3))).toEqual({
            type: REQUEST_TYPE.START_LOG,
            message: 3,
        });
    });

    it("rejects_malformed_requests", () => {
        expect(parseRequest("not json")).toBeNull();
        expect(parseRequest("null")).toBeNull();
        expect(parseRequest('{"type":"reboot","message":1}')).toBeNull();
        expect(parseRequest('{"type":"start_log","message":-1}')).toBeNull();
        expect(parseRequest(42)).toBeNull();
    });
});

describe("SimulatedEngineSocket", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("follows_the_engine_message_order_and_stream_delay", () => {
        const { socket, frames, events } = connect();
        expect(socket.readyState).toBe(0);
        vi.advanceTimersByTime(OPEN_DELAY_MS);
        expect(events).toEqual(["open"]);
        expect(dataTypes(frames)).toEqual([DATA_TYPE.TOPOLOGY, DATA_TYPE.SYSTEM_INFO]);

        vi.advanceTimersByTime(STREAM_DELAY_MS + TICK_MS - 1);
        expect(frames).toHaveLength(2);
        vi.advanceTimersByTime(1 + TICK_MS * 2);
        expect(dataTypes(frames.slice(2))).toEqual([
            DATA_TYPE.STATS,
            DATA_TYPE.STATS,
            DATA_TYPE.STATS,
        ]);
    });

    it("answers_requests_after_a_short_delay", () => {
        const { socket, frames } = connect();
        vi.advanceTimersByTime(OPEN_DELAY_MS);
        socket.send(encodeRequest(REQUEST_TYPE.GET_LOG_LIST, 0));
        socket.send(encodeRequest(REQUEST_TYPE.GET_CONTAINERS, 0));
        socket.send(encodeRequest(REQUEST_TYPE.GET_LOG_DATA, 0));
        expect(frames).toHaveLength(2);
        vi.advanceTimersByTime(REPLY_DELAY_MS);
        expect(dataTypes(frames.slice(2))).toEqual([
            DATA_TYPE.LOG_LIST,
            DATA_TYPE.CONTAINER_LIST,
            DATA_TYPE.LOG_DATA,
        ]);
        expect(Object.keys(frames[2].log_list)).toHaveLength(SEEDED_RECORDINGS.length);
    });

    it("adds_a_recording_on_start_log", () => {
        const { socket, frames } = connect();
        vi.advanceTimersByTime(OPEN_DELAY_MS);
        socket.send(encodeRequest(REQUEST_TYPE.START_LOG, 2));
        socket.send(encodeRequest(REQUEST_TYPE.GET_LOG_LIST, 0));
        vi.advanceTimersByTime(REPLY_DELAY_MS);
        expect(Object.keys(frames.at(-1).log_list)).toHaveLength(SEEDED_RECORDINGS.length + 1);
    });

    it("streams_container_output_until_stopped", () => {
        const { socket, frames } = connect();
        vi.advanceTimersByTime(OPEN_DELAY_MS);
        socket.send(encodeRequest(REQUEST_TYPE.START_CONTAINER_OUTPUT, encodeStreamRequest(1)));
        vi.advanceTimersByTime(REPLY_DELAY_MS);
        const lines = frames.filter((f) => typeof f.log_line === "string");
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.every((f) => f.data_type === 11)).toBe(true);

        socket.send(encodeRequest(REQUEST_TYPE.STOP_CONTAINER_OUTPUT, 11));
        vi.advanceTimersByTime(REPLY_DELAY_MS);
        const count = frames.length;
        vi.advanceTimersByTime(60_000);
        expect(frames.slice(count).every((f) => f.data_type === DATA_TYPE.STATS)).toBe(true);
    });

    it("ignores_malformed_requests", () => {
        const { socket, frames } = connect();
        vi.advanceTimersByTime(OPEN_DELAY_MS);
        socket.send("garbage");
        socket.send('{"type":"shutdown","message":0}');
        vi.advanceTimersByTime(REPLY_DELAY_MS);
        expect(frames).toHaveLength(2);
    });

    it("refuses_to_send_while_connecting", () => {
        const { socket } = connect();
        expect(() => socket.send(encodeRequest(REQUEST_TYPE.GET_LOG_LIST, 0))).toThrow();
    });

    it("leaves_no_timers_after_close", () => {
        const { socket, events } = connect();
        vi.advanceTimersByTime(OPEN_DELAY_MS + STREAM_DELAY_MS + TICK_MS);
        socket.send(encodeRequest(REQUEST_TYPE.START_CONTAINER_OUTPUT, encodeStreamRequest(0)));
        vi.advanceTimersByTime(REPLY_DELAY_MS);
        socket.close(1000, "bye");
        vi.advanceTimersByTime(0);
        expect(events).toEqual(["open", "close:1000"]);
        expect(socket.readyState).toBe(3);
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe("simulated transport", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("drives_the_real_transport_end_to_end", () => {
        const transport = new Transport(simulatedTransportOptions());
        const received = [];
        transport.addEventListener("message", (event) => received.push(JSON.parse(event.detail)));
        transport.connect();
        expect(transport.state).toBe(STATE.CONNECTING);
        vi.advanceTimersByTime(OPEN_DELAY_MS);
        expect(transport.state).toBe(STATE.OPEN);
        expect(transport.url).toBe(DEMO_SOCKET_URL);

        vi.advanceTimersByTime(STREAM_DELAY_MS + TICK_MS);
        expect(dataTypes(received)).toEqual([
            DATA_TYPE.TOPOLOGY,
            DATA_TYPE.SYSTEM_INFO,
            DATA_TYPE.STATS,
        ]);

        transport.reconnect();
        vi.advanceTimersByTime(OPEN_DELAY_MS);
        expect(transport.state).toBe(STATE.OPEN);
        expect(received.at(-1).data_type).toBe(DATA_TYPE.SYSTEM_INFO);

        transport.disconnect();
        vi.advanceTimersByTime(0);
        expect(transport.state).toBe(STATE.CLOSED);
        expect(vi.getTimerCount()).toBe(0);
    });
});

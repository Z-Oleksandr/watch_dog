import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { channelFor, encodeStreamRequest } from "../protocol/channels.js";
import { isStreamFrame, validateFrame } from "../protocol/messages.js";
import { CONTAINER_LINE_INTERVAL_MS, CONTAINER_NAMES, CONTAINER_TAIL_LINES } from "./config.js";
import { ContainerStreams, containerListFrame, decodeStreamRequest } from "./containers.js";
import { Random } from "./random.js";

function build() {
    const frames = [];
    const streams = new ContainerStreams({
        random: new Random(2),
        emit: (frame) => frames.push(frame),
        now: () => Date.UTC(2026, 9, 20, 9, 0, 0),
    });
    return { streams, frames };
}

describe("decodeStreamRequest", () => {
    it("inverts_the_panel_encoding", () => {
        for (const index of [0, 1, 4, 10]) {
            expect(decodeStreamRequest(encodeStreamRequest(index))).toEqual({
                index,
                channel: channelFor(index),
            });
        }
    });

    it("rejects_messages_without_the_separator", () => {
        expect(decodeStreamRequest(1234)).toBeNull();
    });
});

describe("containerListFrame", () => {
    it("lists_every_container_by_index", () => {
        const frame = containerListFrame();
        expect(validateFrame(frame).ok).toBe(true);
        expect(Object.values(frame.list)).toEqual([...CONTAINER_NAMES]);
    });
});

describe("ContainerStreams", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("sends_the_tail_then_follows_on_the_requested_channel", () => {
        const { streams, frames } = build();
        expect(streams.start(encodeStreamRequest(2))).toBe(true);
        expect(frames).toHaveLength(CONTAINER_TAIL_LINES);
        vi.advanceTimersByTime(CONTAINER_LINE_INTERVAL_MS.max * 3);
        expect(frames.length).toBeGreaterThan(CONTAINER_TAIL_LINES + 2);
        for (const frame of frames) {
            expect(isStreamFrame(frame)).toBe(true);
            expect(frame.data_type).toBe(channelFor(2));
            expect(frame.log_line).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{9}Z .+\n$/);
        }
    });

    it("stops_a_stream_on_request", () => {
        const { streams, frames } = build();
        streams.start(encodeStreamRequest(1));
        streams.stop(channelFor(1));
        const count = frames.length;
        vi.advanceTimersByTime(CONTAINER_LINE_INTERVAL_MS.max * 5);
        expect(frames).toHaveLength(count);
        expect(streams.activeChannels).toEqual([]);
    });

    it("ignores_unknown_containers", () => {
        const { streams, frames } = build();
        expect(streams.start(encodeStreamRequest(CONTAINER_NAMES.length))).toBe(false);
        expect(frames).toEqual([]);
    });

    it("stops_every_stream_at_once", () => {
        const { streams } = build();
        streams.start(encodeStreamRequest(0));
        streams.start(encodeStreamRequest(3));
        streams.stopAll();
        expect(streams.activeChannels).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
    });
});

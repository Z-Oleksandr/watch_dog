import { describe, expect, it } from "vitest";

import { channelFor, encodeStreamRequest } from "./channels.js";

describe("channels", () => {
    // Vectors mirror engine/src/docker_mon/stream_container.rs tests.
    it("doubles_the_index_digits_for_the_channel", () => {
        expect(channelFor(2)).toBe(22);
        expect(channelFor(10)).toBe(1010);
        expect(channelFor(9)).toBe(99);
        expect(channelFor(0)).toBe(0);
    });

    it("encodes_the_start_request_the_engine_expects", () => {
        expect(encodeStreamRequest(2)).toBe(29989922);
        expect(encodeStreamRequest(10)).toBe(10998991010);
        expect(encodeStreamRequest(9)).toBe(99989999);
        expect(encodeStreamRequest(0)).toBe(9989900);
    });

    it("rejects_invalid_indexes", () => {
        expect(() => channelFor(-1)).toThrow(RangeError);
        expect(() => channelFor(1.5)).toThrow(RangeError);
        expect(() => encodeStreamRequest(10 ** 12)).toThrow(RangeError);
    });
});

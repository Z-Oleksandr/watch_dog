import { describe, expect, it } from "vitest";

import { formatLogTimestamp, formatSecondsToTime, stripAnsi } from "./format.js";

describe("formatSecondsToTime", () => {
    it("formats_days_hours_minutes_seconds", () => {
        expect(formatSecondsToTime(0)).toBe("0 days, 00:00:00 hours");
        expect(formatSecondsToTime(3661)).toBe("0 days, 01:01:01 hours");
        expect(formatSecondsToTime(2 * 86400 + 5)).toBe("2 days, 00:00:05 hours");
    });

    it("never_renders_nan", () => {
        expect(formatSecondsToTime(NaN)).toBe("0 days, 00:00:00 hours");
        expect(formatSecondsToTime(-5)).toBe("0 days, 00:00:00 hours");
    });
});

describe("stripAnsi", () => {
    it("removes_colour_sequences", () => {
        expect(stripAnsi("\x1b[31mred\x1b[0m plain")).toBe("red plain");
    });
});

describe("formatLogTimestamp", () => {
    it("returns_unparseable_input_unchanged", () => {
        expect(formatLogTimestamp("garbage")).toBe("garbage");
    });

    it("formats_iso_timestamps", () => {
        expect(formatLogTimestamp("2025-03-04T05:06:07Z")).toMatch(/2025/);
    });
});

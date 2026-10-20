import { describe, expect, it } from "vitest";

import { driveReading, sameTemps, summarizeDriveTemps } from "./drive_temps.js";

describe("driveReading", () => {
    it("formats_a_rounded_temperature", () => {
        expect(driveReading(41.6, 70)).toEqual({ text: "42°", alert: false });
    });

    it("alerts_at_the_warning_threshold", () => {
        expect(driveReading(55, 55)).toEqual({ text: "55°", alert: true });
    });

    it("alerts_when_the_shown_value_rounds_up_to_the_threshold", () => {
        expect(driveReading(54.6, 55).alert).toBe(true);
    });

    it("does_not_alert_without_a_threshold", () => {
        expect(driveReading(99, null).alert).toBe(false);
    });

    it("is_null_without_a_temperature", () => {
        expect(driveReading(null, 55)).toBeNull();
    });
});

describe("summarizeDriveTemps", () => {
    it("averages_drives_below_their_thresholds", () => {
        expect(summarizeDriveTemps([40, 50], [55, 70])).toEqual({ text: "45°", alert: false });
    });

    it("ignores_disks_without_a_temperature_in_the_average", () => {
        expect(summarizeDriveTemps([40, null, 44], [55, null, 70])).toEqual({
            text: "42°",
            alert: false,
        });
    });

    it("shows_a_drive_over_its_threshold_in_red", () => {
        expect(summarizeDriveTemps([56, 30], [55, 70])).toEqual({ text: "56°", alert: true });
    });

    it("shows_the_hottest_of_several_drives_over_their_thresholds", () => {
        expect(summarizeDriveTemps([58, 75, 90], [55, 70, null])).toEqual({
            text: "75°",
            alert: true,
        });
    });

    it("judges_each_drive_against_its_own_threshold", () => {
        expect(summarizeDriveTemps([60, 50], [70, 55]).alert).toBe(false);
    });

    it("is_null_when_no_disk_has_a_temperature", () => {
        expect(summarizeDriveTemps([null, null], [55, 70])).toBeNull();
    });
});

describe("sameTemps", () => {
    it("matches_equal_values", () => {
        expect(sameTemps([41, null], [41, null])).toBe(true);
    });

    it("detects_a_changed_value", () => {
        expect(sameTemps([41, null], [42, null])).toBe(false);
    });

    it("never_matches_a_missing_previous_frame", () => {
        expect(sameTemps([], null)).toBe(false);
    });
});

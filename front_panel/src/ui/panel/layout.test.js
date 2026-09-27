import { describe, expect, it } from "vitest";

import { tempAlertAt, tempClusterOptions } from "./layout.js";

describe("tempAlertAt", () => {
    it("alerts_at_90_for_a_sensor_with_a_high_critical_value", () => {
        expect(tempAlertAt(110)).toBe(90);
    });

    it("alerts_at_the_red_zone_for_a_sensor_with_a_low_critical_value", () => {
        expect(tempAlertAt(80)).toBe(68);
    });

    it("alerts_at_90_without_a_critical_value", () => {
        expect(tempAlertAt(null)).toBe(90);
    });
});

describe("tempClusterOptions", () => {
    const group = (critical) => ({ name: "g", display: "G", indices: [0], critical });

    it("gives_each_member_its_own_alert_threshold", () => {
        const options = tempClusterOptions([group(110), group(80)]);
        expect(options.members.map((m) => m.alertAt)).toEqual([90, 68]);
    });

    it("lets_a_multi_group_summary_alert_from_its_members", () => {
        const options = tempClusterOptions([group(110), group(80)]);
        expect(options.summary).toMatchObject({ alertAt: null, alertFromMembers: true });
    });

    it("gives_a_single_group_summary_that_group_threshold", () => {
        expect(tempClusterOptions([group(80)]).summary.alertAt).toBe(68);
    });
});

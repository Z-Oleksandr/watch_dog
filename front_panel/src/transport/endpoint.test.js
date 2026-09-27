import { describe, expect, it } from "vitest";

import { resolveSocketUrl } from "./endpoint.js";

describe("resolveSocketUrl", () => {
    it("uses_the_same_origin_ws_path", () => {
        expect(resolveSocketUrl({ protocol: "http:", host: "10.0.0.5:9000" })).toBe(
            "ws://10.0.0.5:9000/ws"
        );
    });

    it("upgrades_to_wss_on_https_pages", () => {
        expect(resolveSocketUrl({ protocol: "https:", host: "panel.lan" })).toBe(
            "wss://panel.lan/ws"
        );
    });

    it("ignores_the_dev_override_in_production_builds", () => {
        expect(
            resolveSocketUrl({ protocol: "http:", host: "a:9000", search: "?ws=ws://b:8999" })
        ).toBe("ws://a:9000/ws");
    });
});

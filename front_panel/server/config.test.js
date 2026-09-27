import { describe, expect, it } from "vitest";

import { ConfigError, DEFAULTS, loadConfig } from "./config.js";

describe("loadConfig", () => {
    it("uses defaults when the environment is empty", () => {
        const config = loadConfig({});
        expect(config.port).toBe(DEFAULTS.port);
        expect(config.bind).toBe(DEFAULTS.bind);
        expect(config.engine.url).toBe("ws://127.0.0.1:8999");
        expect(config.logLevel).toBe("info");
        expect(config.isProduction).toBe(true);
    });

    it("treats blank variables as unset", () => {
        const config = loadConfig({ FRONT_PANEL_PORT: "  ", ENGINE_ADDR: "" });
        expect(config.port).toBe(DEFAULTS.port);
        expect(config.engine.port).toBe(8999);
    });

    it("rejects_a_port_outside_the_valid_range", () => {
        expect(() => loadConfig({ FRONT_PANEL_PORT: "70000" })).toThrow(ConfigError);
        expect(() => loadConfig({ FRONT_PANEL_PORT: "abc" })).toThrow(ConfigError);
    });

    it("rejects_a_bind_address_as_engine_target", () => {
        expect(() => loadConfig({ ENGINE_ADDR: "0.0.0.0:8999" })).toThrow(/bind address/);
        expect(() => loadConfig({ ENGINE_ADDR: "[::]:8999" })).toThrow(/bind address/);
    });

    it("accepts_ipv6_engine_targets", () => {
        const config = loadConfig({ ENGINE_ADDR: "[::1]:9001" });
        expect(config.engine.url).toBe("ws://[::1]:9001");
    });

    it("defaults_the_engine_port_when_only_a_host_is_given", () => {
        const config = loadConfig({ ENGINE_ADDR: "engine.local" });
        expect(config.engine.url).toBe("ws://engine.local:8999");
    });

    it("flags_development_mode", () => {
        expect(loadConfig({ NODE_ENV: "development" }).isProduction).toBe(false);
    });
});

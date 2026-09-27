import { describe, expect, it, vi } from "vitest";

import { LaunchError, parseArgs, resolveEngineBinary } from "./launch.js";

function fakeFs({ exists = true, executable = true, chmodFails = false } = {}) {
    return {
        constants: { X_OK: 1 },
        existsSync: vi.fn(() => exists),
        accessSync: vi.fn(() => {
            if (!executable) throw new Error("EACCES");
        }),
        chmodSync: vi.fn(() => {
            if (chmodFails) throw new Error("EPERM");
        }),
    };
}

describe("parseArgs", () => {
    it("defaults_to_prebuilt", () => {
        expect(parseArgs([])).toEqual({ engine: "prebuilt" });
    });

    it("accepts_both_flag_forms", () => {
        expect(parseArgs(["--engine", "source"])).toEqual({ engine: "source" });
        expect(parseArgs(["--engine=none"])).toEqual({ engine: "none" });
    });

    it("rejects_unknown_arguments_and_modes", () => {
        expect(() => parseArgs(["--bogus"])).toThrow(LaunchError);
        expect(() => parseArgs(["--engine", "docker"])).toThrow(LaunchError);
    });
});

describe("resolveEngineBinary", () => {
    it("picks_the_prebuilt_folder_for_the_platform", () => {
        const file = resolveEngineBinary("prebuilt", {
            platform: "linux",
            fs: fakeFs(),
            engineDir: "/e",
        });
        expect(file).toBe("/e/app_linux/engine");
        expect(
            resolveEngineBinary("prebuilt", { platform: "win32", fs: fakeFs(), engineDir: "/e" })
        ).toBe("/e/app_windows/engine.exe");
    });

    it("uses_the_cargo_release_output_in_source_mode", () => {
        expect(
            resolveEngineBinary("source", { platform: "darwin", fs: fakeFs(), engineDir: "/e" })
        ).toBe("/e/target/release/engine");
    });

    it("throws_before_anything_is_spawned_when_the_binary_is_missing", () => {
        expect(() =>
            resolveEngineBinary("prebuilt", {
                platform: "linux",
                fs: fakeFs({ exists: false }),
                engineDir: "/e",
            })
        ).toThrow(/not found at \/e\/app_linux\/engine/);
    });

    it("throws_for_platforms_without_a_prebuilt_engine", () => {
        expect(() =>
            resolveEngineBinary("prebuilt", { platform: "freebsd", fs: fakeFs() })
        ).toThrow(/no prebuilt engine/);
    });

    it("makes_the_binary_executable_when_needed", () => {
        const fs = fakeFs({ executable: false });
        resolveEngineBinary("source", { platform: "linux", fs, engineDir: "/e" });
        expect(fs.chmodSync).toHaveBeenCalledWith("/e/target/release/engine", 0o755);
    });

    it("throws_when_chmod_fails", () => {
        const fs = fakeFs({ executable: false, chmodFails: true });
        expect(() =>
            resolveEngineBinary("source", { platform: "linux", fs, engineDir: "/e" })
        ).toThrow(/chmod failed/);
    });

    it("skips_the_executable_check_on_windows", () => {
        const fs = fakeFs({ executable: false });
        resolveEngineBinary("source", { platform: "win32", fs, engineDir: "/e" });
        expect(fs.accessSync).not.toHaveBeenCalled();
    });
});

#!/usr/bin/env node
"use strict";

/**
 * Starts the front panel host and the engine together, on any platform.
 *
 *   node scripts/launch.js --engine prebuilt   # engine/app_<os>/engine
 *   node scripts/launch.js --engine source     # engine/target/release/engine
 *   node scripts/launch.js --engine none       # front panel only
 *
 * Everything is validated before any process is spawned, so a missing engine
 * binary exits without leaving an orphaned host behind. Both children inherit
 * stdio. When either exits, the other is stopped and the launcher exits with
 * the first non-zero code it saw. SIGINT/SIGTERM are forwarded so `pm2 stop`
 * and Ctrl-C shut both down cleanly.
 *
 * The engine binds to 127.0.0.1 by default because browsers reach it through
 * the front panel's /ws proxy; set WATCH_DOG_ADDR to override.
 */

const { spawn } = require("child_process");
const nodeFs = require("fs");
const path = require("path");

const FRONT_PANEL_DIR = path.resolve(__dirname, "..");
const ENGINE_DIR = path.resolve(FRONT_PANEL_DIR, "..", "engine");
const DEFAULT_ENGINE_ADDR = "127.0.0.1:8999";
const STOP_GRACE_MS = 10_000;
const ENGINE_MODES = Object.freeze(["prebuilt", "source", "none"]);

const PREBUILT_DIRS = Object.freeze({
    linux: "app_linux",
    win32: "app_windows",
    darwin: "app_macos",
});

class LaunchError extends Error {
    constructor(message) {
        super(message);
        this.name = "LaunchError";
    }
}

/** @param {string[]} argv */
function parseArgs(argv) {
    const args = { engine: "prebuilt" };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--engine" && argv[i + 1]) {
            args.engine = argv[++i];
        } else if (argv[i].startsWith("--engine=")) {
            args.engine = argv[i].slice("--engine=".length);
        } else {
            throw new LaunchError(`unknown argument: ${argv[i]}`);
        }
    }
    if (!ENGINE_MODES.includes(args.engine)) {
        throw new LaunchError(`--engine must be prebuilt, source or none, got "${args.engine}"`);
    }
    return args;
}

/**
 * Resolves the engine binary for a mode and makes sure it can run.
 * Throws `LaunchError` instead of exiting so callers decide what to tear down.
 *
 * @param {"prebuilt"|"source"} mode
 * @param {{ platform?: string, fs?: typeof nodeFs, engineDir?: string }} [deps]
 * @returns {string} absolute path of the binary
 */
function resolveEngineBinary(
    mode,
    { platform = process.platform, fs = nodeFs, engineDir = ENGINE_DIR } = {}
) {
    const name = platform === "win32" ? "engine.exe" : "engine";
    let file;
    if (mode === "source") {
        file = path.join(engineDir, "target", "release", name);
    } else {
        const dir = PREBUILT_DIRS[platform];
        if (!dir) {
            throw new LaunchError(
                `no prebuilt engine for platform ${platform}; build from source and use --engine source`
            );
        }
        file = path.join(engineDir, dir, name);
    }

    if (!fs.existsSync(file)) {
        const hint =
            mode === "source"
                ? "build it with `cargo build --release` in engine/"
                : "unpack the engine release archive into that folder, or use `npm run launch` after building from source";
        throw new LaunchError(`engine binary not found at ${file}; ${hint}`);
    }
    if (platform === "win32") {
        return file;
    }
    try {
        fs.accessSync(file, fs.constants.X_OK);
    } catch {
        try {
            fs.chmodSync(file, 0o755);
        } catch (err) {
            throw new LaunchError(
                `engine binary is not executable and chmod failed: ${err.message}`
            );
        }
    }
    return file;
}

function main() {
    const children = new Map();
    let exiting = false;
    let exitCode = 0;

    function stopAll(code) {
        if (exiting) {
            return;
        }
        exiting = true;
        exitCode = code || exitCode;
        if (children.size === 0) {
            process.exit(exitCode);
        }
        for (const child of children.values()) {
            child.kill("SIGTERM");
        }
        const force = setTimeout(() => {
            for (const child of children.values()) {
                child.kill("SIGKILL");
            }
        }, STOP_GRACE_MS);
        force.unref();
        const wait = setInterval(() => {
            if (children.size === 0) {
                clearInterval(wait);
                process.exit(exitCode);
            }
        }, 50);
        wait.unref();
    }

    function start(name, command, argv, options) {
        const child = spawn(command, argv, { stdio: "inherit", ...options });
        children.set(name, child);
        child.on("error", (err) => {
            children.delete(name);
            process.stderr.write(`launch: ${name} failed to start: ${err.message}\n`);
            stopAll(1);
        });
        child.on("exit", (code, signal) => {
            children.delete(name);
            const status = signal ? `signal ${signal}` : `code ${code}`;
            process.stderr.write(`launch: ${name} exited (${status})\n`);
            stopAll(code === null ? 1 : code);
        });
        return child;
    }

    process.on("SIGINT", () => stopAll(0));
    process.on("SIGTERM", () => stopAll(0));

    // Validate everything first: nothing is spawned until both processes can run.
    let args;
    let engineBinary = null;
    try {
        args = parseArgs(process.argv.slice(2));
        if (args.engine !== "none") {
            engineBinary = resolveEngineBinary(args.engine);
        }
    } catch (err) {
        if (err instanceof LaunchError) {
            process.stderr.write(`launch: ${err.message}\n`);
            process.exit(2);
        }
        throw err;
    }

    const engineAddr = process.env.WATCH_DOG_ADDR || DEFAULT_ENGINE_ADDR;

    try {
        start("front_panel", process.execPath, [path.join(FRONT_PANEL_DIR, "server", "index.js")], {
            cwd: FRONT_PANEL_DIR,
            env: { ...process.env, ENGINE_ADDR: process.env.ENGINE_ADDR || engineAddr },
        });

        if (engineBinary) {
            // The engine resolves its log directory relative to the working
            // directory (`../logs/`), so it must run from front_panel/.
            start("engine", engineBinary, [], {
                cwd: FRONT_PANEL_DIR,
                env: { ...process.env, WATCH_DOG_ADDR: engineAddr },
            });
        }
    } catch (err) {
        // A synchronous spawn failure must not leave the other child running.
        process.stderr.write(`launch: ${err.message}\n`);
        stopAll(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { parseArgs, resolveEngineBinary, LaunchError, PREBUILT_DIRS };

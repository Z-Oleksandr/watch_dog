#!/usr/bin/env node
"use strict";

/**
 * Starts the front panel host and the engine together, on any platform.
 *
 *   node scripts/launch.js --engine prebuilt   # engine/app_<os>/engine
 *   node scripts/launch.js --engine source     # engine/target/release/engine
 *   node scripts/launch.js --engine none       # front panel only
 *
 * Both children inherit stdio. When either exits, the other is stopped and the
 * launcher exits with the first non-zero code it saw. SIGINT/SIGTERM are
 * forwarded so `pm2 stop` and Ctrl-C shut both down cleanly.
 *
 * The engine binds to 127.0.0.1 by default because browsers reach it through
 * the front panel's /ws proxy; set WATCH_DOG_ADDR to override.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const FRONT_PANEL_DIR = path.resolve(__dirname, "..");
const ENGINE_DIR = path.resolve(FRONT_PANEL_DIR, "..", "engine");
const DEFAULT_ENGINE_ADDR = "127.0.0.1:8999";
const STOP_GRACE_MS = 10_000;

const PREBUILT_DIRS = Object.freeze({
    linux: "app_linux",
    win32: "app_windows",
    darwin: "app_macos",
});

function parseArgs(argv) {
    const args = { engine: "prebuilt" };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--engine" && argv[i + 1]) {
            args.engine = argv[++i];
        } else if (argv[i].startsWith("--engine=")) {
            args.engine = argv[i].slice("--engine=".length);
        } else {
            fail(`unknown argument: ${argv[i]}`);
        }
    }
    if (!["prebuilt", "source", "none"].includes(args.engine)) {
        fail(`--engine must be prebuilt, source or none, got "${args.engine}"`);
    }
    return args;
}

function fail(message) {
    process.stderr.write(`launch: ${message}\n`);
    process.exit(2);
}

function engineBinary(mode) {
    const name = process.platform === "win32" ? "engine.exe" : "engine";
    if (mode === "source") {
        return path.join(ENGINE_DIR, "target", "release", name);
    }
    const dir = PREBUILT_DIRS[process.platform];
    if (!dir) {
        fail(`no prebuilt engine for platform ${process.platform}; build from source and use --engine source`);
    }
    return path.join(ENGINE_DIR, dir, name);
}

function ensureExecutable(file) {
    if (!fs.existsSync(file)) {
        fail(`engine binary not found at ${file}`);
    }
    if (process.platform === "win32") {
        return;
    }
    try {
        fs.accessSync(file, fs.constants.X_OK);
    } catch {
        try {
            fs.chmodSync(file, 0o755);
        } catch (err) {
            fail(`engine binary is not executable and chmod failed: ${err.message}`);
        }
    }
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const children = new Map();
    let exiting = false;
    let exitCode = 0;

    function start(name, command, argv, options) {
        const child = spawn(command, argv, { stdio: "inherit", ...options });
        children.set(name, child);
        child.on("error", (err) => {
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

    function stopAll(code) {
        if (exiting) {
            return;
        }
        exiting = true;
        exitCode = code || exitCode;
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

    process.on("SIGINT", () => stopAll(0));
    process.on("SIGTERM", () => stopAll(0));

    const engineAddr = process.env.WATCH_DOG_ADDR || DEFAULT_ENGINE_ADDR;

    start("front_panel", process.execPath, [path.join(FRONT_PANEL_DIR, "server", "index.js")], {
        cwd: FRONT_PANEL_DIR,
        env: { ...process.env, ENGINE_ADDR: process.env.ENGINE_ADDR || engineAddr },
    });

    if (args.engine !== "none") {
        const binary = engineBinary(args.engine);
        ensureExecutable(binary);
        // The engine resolves its log directory relative to the working
        // directory (`../logs/`), so it must run from front_panel/.
        start("engine", binary, [], {
            cwd: FRONT_PANEL_DIR,
            env: { ...process.env, WATCH_DOG_ADDR: engineAddr },
        });
    }
}

main();

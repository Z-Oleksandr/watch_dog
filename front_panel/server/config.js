"use strict";

const path = require("path");

/**
 * Runtime configuration for the front panel host, read once from the
 * environment and validated. Invalid values fail loudly at startup instead of
 * surfacing as a half-working server.
 *
 * | Variable           | Default          | Purpose                          |
 * | ------------------ | ---------------- | -------------------------------- |
 * | FRONT_PANEL_PORT   | 9000             | HTTP listen port                 |
 * | FRONT_PANEL_BIND   | 0.0.0.0          | Listen address                   |
 * | ENGINE_ADDR        | 127.0.0.1:8999   | WebSocket proxy target host:port |
 * | FRONT_PANEL_LOG    | info             | off|error|warn|info|debug        |
 */

const DEFAULTS = Object.freeze({
    port: 9000,
    bind: "0.0.0.0",
    engineAddr: "127.0.0.1:8999",
    logLevel: "info",
});

const ROOT = path.resolve(__dirname, "..");

/** How long shutdown waits for in-flight work before exiting anyway. */
const SHUTDOWN_GRACE_MS = 10_000;

class ConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = "ConfigError";
    }
}

function readString(env, key, fallback) {
    const raw = env[key];
    if (raw === undefined || raw.trim() === "") {
        return fallback;
    }
    return raw.trim();
}

function parsePort(raw, key) {
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new ConfigError(`${key} must be an integer between 1 and 65535, got "${raw}"`);
    }
    return port;
}

/**
 * Accepts `host:port`, `[v6]:port`, or a bare host (defaulting the port).
 * Rejects the unspecified addresses, which are bind addresses and never valid
 * as a connect target.
 */
function parseEngineAddr(raw) {
    const match = /^(?:\[([^\]]+)\]|([^:]+))(?::(\d+))?$/.exec(raw);
    if (!match) {
        throw new ConfigError(`ENGINE_ADDR must look like host:port, got "${raw}"`);
    }
    const host = match[1] || match[2];
    const port = match[3] === undefined ? 8999 : parsePort(match[3], "ENGINE_ADDR port");
    if (host === "0.0.0.0" || host === "::" || host === "[::]") {
        throw new ConfigError(
            `ENGINE_ADDR host "${host}" is a bind address; use the address the engine listens on (e.g. 127.0.0.1)`
        );
    }
    const isV6 = host.includes(":");
    return { host, port, url: `ws://${isV6 ? `[${host}]` : host}:${port}` };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function loadConfig(env = process.env) {
    const port = parsePort(readString(env, "FRONT_PANEL_PORT", String(DEFAULTS.port)), "FRONT_PANEL_PORT");
    const bind = readString(env, "FRONT_PANEL_BIND", DEFAULTS.bind);
    const engine = parseEngineAddr(readString(env, "ENGINE_ADDR", DEFAULTS.engineAddr));
    const logLevel = readString(env, "FRONT_PANEL_LOG", DEFAULTS.logLevel).toLowerCase();
    const isProduction = readString(env, "NODE_ENV", "production") !== "development";

    return Object.freeze({
        port,
        bind,
        engine,
        logLevel,
        isProduction,
        distDir: path.join(ROOT, "dist"),
        publicDir: path.join(ROOT, "public"),
        shutdownGraceMs: SHUTDOWN_GRACE_MS,
    });
}

module.exports = { loadConfig, ConfigError, DEFAULTS };

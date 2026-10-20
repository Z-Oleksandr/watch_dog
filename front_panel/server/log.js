"use strict";

/**
 * Minimal leveled logger for the Node host process. Writes one line per event
 * to stderr (errors/warnings) or stdout with a scope and an optional context
 * object, so pm2 log files stay greppable.
 */

const LEVELS = Object.freeze({ off: 0, error: 1, warn: 2, info: 3, debug: 4 });

let threshold = LEVELS.info;

function setLevel(name) {
    const level = LEVELS[String(name).toLowerCase()];
    if (level === undefined) {
        return false;
    }
    threshold = level;
    return true;
}

function format(level, scope, message, context) {
    const stamp = new Date().toISOString();
    const base = `${stamp} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
    if (context === undefined) {
        return base;
    }
    let rendered;
    try {
        rendered = JSON.stringify(context, replacer);
    } catch {
        rendered = String(context);
    }
    return `${base} ${rendered}`;
}

function replacer(_key, value) {
    if (value instanceof Error) {
        return { name: value.name, message: value.message, code: value.code };
    }
    return value;
}

function emit(level, scope, message, context) {
    if (LEVELS[level] > threshold) {
        return;
    }
    const line = format(level, scope, message, context);
    if (level === "error" || level === "warn") {
        process.stderr.write(`${line}\n`);
    } else {
        process.stdout.write(`${line}\n`);
    }
}

const log = Object.freeze({
    setLevel,
    error: (scope, message, context) => emit("error", scope, message, context),
    warn: (scope, message, context) => emit("warn", scope, message, context),
    info: (scope, message, context) => emit("info", scope, message, context),
    debug: (scope, message, context) => emit("debug", scope, message, context),
});

module.exports = { log, LEVELS };

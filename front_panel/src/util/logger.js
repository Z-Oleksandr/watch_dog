/**
 * Leveled, scoped logger. The only module allowed to touch `console`.
 *
 * `debug` output is on in development builds, and can be enabled in a
 * production build by setting `localStorage.setItem("watchdog.debug", "1")`.
 */

const LEVELS = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3 });

const DEBUG_FLAG = "watchdog.debug";

function initialThreshold() {
    if (__DEV__) {
        return LEVELS.debug;
    }
    try {
        if (globalThis.localStorage && globalThis.localStorage.getItem(DEBUG_FLAG) === "1") {
            return LEVELS.debug;
        }
    } catch {
        // Storage can be blocked (private mode, sandboxed iframe); default applies.
    }
    return LEVELS.info;
}

let threshold = initialThreshold();

function emit(level, scope, message, context) {
    if (LEVELS[level] > threshold) {
        return;
    }
    const line = `[${scope}] ${message}`;
    const sink = console[level] || console.log;
    if (context === undefined) {
        sink(line);
    } else {
        sink(line, context);
    }
}

export const log = Object.freeze({
    /** @param {"error"|"warn"|"info"|"debug"} level */
    setLevel(level) {
        if (LEVELS[level] === undefined) {
            return false;
        }
        threshold = LEVELS[level];
        return true;
    },
    error: (scope, message, context) => emit("error", scope, message, context),
    warn: (scope, message, context) => emit("warn", scope, message, context),
    info: (scope, message, context) => emit("info", scope, message, context),
    debug: (scope, message, context) => emit("debug", scope, message, context),
});

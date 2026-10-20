const SECONDS_PER_DAY = 24 * 3600;

/**
 * Formats an uptime given in seconds as `D days, HH:MM:SS hours`.
 * Non-finite or negative input renders as zero rather than `NaN`.
 * @param {number} secondsInput
 */
export function formatSecondsToTime(secondsInput) {
    const total = Number.isFinite(secondsInput) && secondsInput > 0 ? Math.floor(secondsInput) : 0;
    const days = Math.floor(total / SECONDS_PER_DAY);
    const remainder = total % SECONDS_PER_DAY;
    const hours = String(Math.floor(remainder / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((remainder % 3600) / 60)).padStart(2, "0");
    const seconds = String(remainder % 60).padStart(2, "0");
    return `${days} days, ${hours}:${minutes}:${seconds} hours`;
}

// eslint-disable-next-line no-control-regex -- ESC is the point of this pattern.
const ANSI_ESCAPE = /\x1b\[[0-9;]*[A-Za-z]/g;

/** Strips ANSI colour and cursor sequences from a container log line. */
export function stripAnsi(text) {
    return text.replace(ANSI_ESCAPE, "");
}

/**
 * Renders an ISO timestamp the way the portals show it; unparseable input is
 * returned unchanged so the line is never lost.
 */
export function formatLogTimestamp(raw) {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
        return raw;
    }
    return date.toLocaleString("de-DE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

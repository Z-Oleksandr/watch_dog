/**
 * Synthetic output for the simulated containers. Each generator returns one
 * line in the style of the real program, prefixed with the RFC 3339
 * nanosecond timestamp Docker adds when the engine asks for `timestamps`.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NANOS_DIGITS = 6;

const PATHS = [
    "/",
    "/posts",
    "/posts/rust-websockets",
    "/world",
    "/watch_dog/",
    "/about",
    "/feed.xml",
];
const API_PATHS = ["/api/posts", "/api/posts/42", "/api/comments", "/api/session", "/health"];
const AGENTS = [
    "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148",
    "curl/8.5.0",
];
const TABLES = ["public.posts", "public.comments", "public.sessions", "public.page_views"];

const pad = (value, width = 2) => String(value).padStart(width, "0");

function clock(date) {
    return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function millis(date) {
    return pad(date.getUTCMilliseconds(), 3);
}

function isoDate(date) {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function dockerTimestamp(random, date) {
    const nanos = pad(random.int(0, 10 ** NANOS_DIGITS - 1), NANOS_DIGITS);
    return `${isoDate(date)}T${clock(date)}.${millis(date)}${nanos}Z`;
}

function clientAddress(random) {
    return `192.168.${random.int(0, 3)}.${random.int(2, 254)}`;
}

function reverseProxyLine(random, date) {
    const day = `${pad(date.getUTCDate())}/${MONTHS[date.getUTCMonth()]}/${date.getUTCFullYear()}`;
    const status = random.chance(0.06) ? random.pick([301, 304, 404]) : 200;
    const request = `"GET ${random.pick(PATHS)} HTTP/1.1" ${status} ${random.int(180, 48_000)}`;
    return `${clientAddress(random)} - - [${day}:${clock(date)} +0000] ${request} "-" "${random.pick(AGENTS)}"`;
}

function blogLine(random) {
    if (random.chance(0.05)) {
        return `[warn] slow query on GET /api/posts took ${random.int(250, 900)}ms`;
    }
    const method = random.chance(0.85) ? "GET" : "POST";
    return `[info] ${method} ${random.pick(API_PATHS)} 200 ${random.int(2, 60)}ms`;
}

function postgresLine(random, date) {
    const prefix = `${isoDate(date)} ${clock(date)}.${millis(date)} UTC [${random.int(40, 900)}]`;
    if (random.chance(0.4)) {
        const buffers = random.int(3, 240);
        return `${prefix} LOG:  checkpoint complete: wrote ${buffers} buffers (${(buffers / 160).toFixed(1)}%); write=${(buffers / 100).toFixed(3)} s`;
    }
    return `${prefix} LOG:  automatic vacuum of table "blog.${random.pick(TABLES)}": index scans: ${random.int(0, 2)}`;
}

function redisLine(random, date) {
    const prefix = `1:M ${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} ${clock(date)}.${millis(date)}`;
    const options = [
        `${prefix} * ${random.int(10, 400)} changes in 300 seconds. Saving...`,
        `${prefix} * Background saving started by pid ${random.int(100, 999)}`,
        `${prefix} * Background saving terminated with success`,
        `${prefix} * DB saved on disk`,
    ];
    return random.pick(options);
}

function backupLine(random) {
    const total = 120;
    const options = [
        `[backup] uploading chunk ${random.int(1, total)}/${total} (${random.between(4, 64).toFixed(1)} MiB)`,
        `[backup] deduplicated ${random.int(60, 98)}% of scanned data`,
        `[backup] snapshot ${random.int(0x10000000, 0xffffffff).toString(16)} saved`,
        `[backup] pruning: keeping 7 daily, 4 weekly, 6 monthly snapshots`,
    ];
    return random.pick(options);
}

const GENERATORS = Object.freeze({
    "reverse-proxy": reverseProxyLine,
    blog: blogLine,
    postgres: postgresLine,
    redis: redisLine,
    "nightly-backup": backupLine,
});

/**
 * One log line for `container`, as the engine would forward it.
 * @param {string} container  A name from `CONTAINER_NAMES`.
 * @param {import("./random.js").Random} random
 * @param {Date} date
 */
export function containerLogLine(container, random, date) {
    const generate = GENERATORS[container] ?? blogLine;
    return `${dockerTimestamp(random, date)} ${generate(random, date)}\n`;
}

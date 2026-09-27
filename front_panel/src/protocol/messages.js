/**
 * Wire contract with the engine. This is the only module that spells frame
 * field names or request strings; everything else goes through these
 * constants and validators.
 *
 * Client -> engine: `{ "type": <REQUEST_TYPE>, "message": <non-negative int> }`
 * Engine -> client: every frame carries `data_type`; see DATA_TYPE. Values of
 * 6 and above are container output channels (see ./channels.js).
 */

export const DATA_TYPE = Object.freeze({
    TOPOLOGY: 0,
    STATS: 1,
    SYSTEM_INFO: 2,
    LOG_LIST: 3,
    LOG_DATA: 4,
    CONTAINER_LIST: 5,
});

export const REQUEST_TYPE = Object.freeze({
    START_LOG: "start_log",
    GET_LOG_LIST: "get_log_list",
    GET_LOG_DATA: "get_log_data",
    GET_CONTAINERS: "get_containers",
    START_CONTAINER_OUTPUT: "start_container_output",
    STOP_CONTAINER_OUTPUT: "stop_container_output",
});

const REQUEST_TYPES = new Set(Object.values(REQUEST_TYPE));

/** The engine encodes `message` as u64; this is the largest exactly representable value here. */
export const MAX_MESSAGE_VALUE = Number.MAX_SAFE_INTEGER;

/** Longest recording the panel lets the operator request, in hours (30 days). */
export const MAX_LOG_HOURS = 720;

export function isRequestType(type) {
    return REQUEST_TYPES.has(type);
}

export function isValidMessageValue(value) {
    return Number.isInteger(value) && value >= 0 && value <= MAX_MESSAGE_VALUE;
}

/**
 * Serializes a request. Returns `null` when the inputs violate the contract.
 * @param {string} type
 * @param {number} message
 */
export function encodeRequest(type, message) {
    if (!isRequestType(type) || !isValidMessageValue(message)) {
        return null;
    }
    return JSON.stringify({ type, message });
}

// ---------------------------------------------------------------------------
// Frame validation
// ---------------------------------------------------------------------------

const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
const isString = (v) => typeof v === "string";
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isNumberArray = (v) => Array.isArray(v) && v.every(isNumber);
const isStringMap = (v) => isObject(v) && Object.values(v).every(isString);
const isSeries = (v) =>
    Array.isArray(v) && v.every((p) => isObject(p) && isString(p.time_stamp) && isNumber(p.value));

function invalid(reason) {
    return { ok: false, reason };
}

function valid(frame) {
    return { ok: true, frame };
}

function validateTopology(f) {
    if (!Number.isInteger(f.num_cpus) || f.num_cpus < 1) return invalid("num_cpus");
    if (!isNumberArray(f.disks_space)) return invalid("disks_space");
    if (!isNumber(f.init_ram_total) || f.init_ram_total <= 0) return invalid("init_ram_total");
    if (!Array.isArray(f.temp_sensors)) return invalid("temp_sensors");
    for (const sensor of f.temp_sensors) {
        if (!isObject(sensor) || !isString(sensor.label)) return invalid("temp_sensors[].label");
        if (
            sensor.critical !== undefined &&
            sensor.critical !== null &&
            !isNumber(sensor.critical)
        ) {
            return invalid("temp_sensors[].critical");
        }
    }
    return valid(f);
}

function validateStats(f) {
    if (!isNumberArray(f.cpu_usage)) return invalid("cpu_usage");
    if (!isNumber(f.ram_used)) return invalid("ram_used");
    if (!isNumberArray(f.disks_used_space)) return invalid("disks_used_space");
    if (!isNumber(f.network_received)) return invalid("network_received");
    if (!isNumber(f.network_transmitted)) return invalid("network_transmitted");
    if (!isNumber(f.uptime)) return invalid("uptime");
    if (f.temperatures !== undefined && !isNumberArray(f.temperatures))
        return invalid("temperatures");
    return valid(f);
}

function validateSystemInfo(f) {
    for (const [key, value] of Object.entries(f)) {
        if (key === "data_type") continue;
        if (!isString(value) && !isNumber(value)) return invalid(`system_info.${key}`);
    }
    return valid(f);
}

function validateLogList(f) {
    return isStringMap(f.log_list) ? valid(f) : invalid("log_list");
}

function validateLogData(f) {
    const cnr = f.cnr_data;
    const net = f.net_data;
    if (!isObject(cnr) || !isSeries(cnr.cpu) || !isSeries(cnr.ram)) return invalid("cnr_data");
    if (!isObject(net) || !isObject(net.network)) return invalid("net_data");
    if (!isSeries(net.network.down) || !isSeries(net.network.up))
        return invalid("net_data.network");
    return valid(f);
}

function validateContainerList(f) {
    return isStringMap(f.list) ? valid(f) : invalid("list");
}

const VALIDATORS = Object.freeze({
    [DATA_TYPE.TOPOLOGY]: validateTopology,
    [DATA_TYPE.STATS]: validateStats,
    [DATA_TYPE.SYSTEM_INFO]: validateSystemInfo,
    [DATA_TYPE.LOG_LIST]: validateLogList,
    [DATA_TYPE.LOG_DATA]: validateLogData,
    [DATA_TYPE.CONTAINER_LIST]: validateContainerList,
});

/** A container output line on a stream channel: `{ data_type: <channel>, log_line }`. */
export function isStreamFrame(frame) {
    return isObject(frame) && Number.isInteger(frame.data_type) && isString(frame.log_line);
}

/**
 * Parses raw socket text into an object with an integer `data_type`.
 * @param {string} raw
 */
export function parseFrame(raw) {
    let frame;
    try {
        frame = JSON.parse(raw);
    } catch {
        return invalid("json");
    }
    if (!isObject(frame) || !Number.isInteger(frame.data_type) || frame.data_type < 0) {
        return invalid("data_type");
    }
    return valid(frame);
}

/**
 * Checks a known frame type against its shape. Unknown types pass through
 * unvalidated so the dispatcher can decide what to do with them.
 */
export function validateFrame(frame) {
    const validator = VALIDATORS[frame.data_type];
    return validator ? validator(frame) : valid(frame);
}

export function hasValidator(dataType) {
    return Object.prototype.hasOwnProperty.call(VALIDATORS, dataType);
}

/**
 * Container output streams are multiplexed over `data_type` values chosen by
 * the panel. The engine decodes a start request as `<index>99899<channel>`
 * (see `engine/src/docker_mon/stream_container.rs::get_index_and_channel`) and
 * then tags every log line of that container with `data_type: <channel>`.
 *
 * The channel for container `n` is `n` with its digits doubled (2 -> 22,
 * 10 -> 1010). Container 0 therefore streams on channel 0, which is also the
 * topology frame type; the dispatcher tells them apart by the presence of
 * `log_line`, so both sides must keep that field.
 */

export const CHANNEL_SEPARATOR = "99899";

/** @param {number} index */
export function channelFor(index) {
    assertIndex(index);
    return Number(String(index).repeat(2));
}

/**
 * The numeric `message` for a `start_container_output` request.
 * @param {number} index
 */
export function encodeStreamRequest(index) {
    assertIndex(index);
    const encoded = Number(`${index}${CHANNEL_SEPARATOR}${String(index).repeat(2)}`);
    if (!Number.isSafeInteger(encoded)) {
        throw new RangeError(`container index ${index} does not encode to a safe integer`);
    }
    return encoded;
}

function assertIndex(index) {
    if (!Number.isInteger(index) || index < 0) {
        throw new RangeError(`container index must be a non-negative integer, got ${index}`);
    }
}

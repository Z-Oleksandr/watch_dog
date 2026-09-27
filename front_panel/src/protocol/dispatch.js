import { log } from "../util/logger.js";
import { hasValidator, isStreamFrame, parseFrame, validateFrame } from "./messages.js";

/**
 * Builds the single `onmessage` pipeline: parse -> validate -> dispatch.
 *
 * @param {object} options
 * @param {Record<number, (frame: object) => void>} options.handlers  Keyed by DATA_TYPE.
 * @param {(channel: number) => boolean} options.isStreamChannel  Whether a channel has an open stream.
 * @param {(channel: number, line: string) => void} options.onStreamLine
 * @param {(frame: object) => object} [options.preprocess]  Dev-only hook (mocks).
 */
export function createDispatcher({ handlers, isStreamChannel, onStreamLine, preprocess }) {
    const table = Object.freeze({ ...handlers });
    const unknownSeen = new Set();

    return function dispatch(raw) {
        const parsed = parseFrame(raw);
        if (!parsed.ok) {
            log.warn("protocol", "dropped unparseable frame", {
                reason: parsed.reason,
                size: typeof raw === "string" ? raw.length : -1,
            });
            return false;
        }

        let frame = parsed.frame;
        if (preprocess) {
            frame = preprocess(frame);
        }

        // Stream lines take precedence: channel 0 is shared with the topology
        // frame type, and only stream frames carry `log_line`.
        if (isStreamFrame(frame) && isStreamChannel(frame.data_type)) {
            return guarded(() => onStreamLine(frame.data_type, frame.log_line), frame.data_type);
        }

        const handler = table[frame.data_type];
        if (!handler) {
            if (!unknownSeen.has(frame.data_type)) {
                unknownSeen.add(frame.data_type);
                log.debug("protocol", "no handler for data_type", { dataType: frame.data_type });
            }
            return false;
        }

        if (hasValidator(frame.data_type)) {
            const checked = validateFrame(frame);
            if (!checked.ok) {
                log.warn("protocol", "dropped invalid frame", {
                    dataType: frame.data_type,
                    field: checked.reason,
                });
                return false;
            }
            frame = checked.frame;
        }

        return guarded(() => handler(frame), frame.data_type);
    };
}

function guarded(fn, dataType) {
    try {
        fn();
        return true;
    } catch (err) {
        log.error("protocol", "frame handler threw", { dataType, err });
        return false;
    }
}

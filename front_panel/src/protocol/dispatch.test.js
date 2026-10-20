import { describe, expect, it, vi } from "vitest";

import { createDispatcher } from "./dispatch.js";
import { DATA_TYPE } from "./messages.js";

function setup(overrides = {}) {
    const handlers = {
        [DATA_TYPE.TOPOLOGY]: vi.fn(),
        [DATA_TYPE.LOG_LIST]: vi.fn(),
    };
    const onStreamLine = vi.fn();
    const channels = new Set([22, 0]);
    const dispatch = createDispatcher({
        handlers,
        onStreamLine,
        isStreamChannel: (c) => channels.has(c),
        ...overrides,
    });
    return { dispatch, handlers, onStreamLine };
}

describe("createDispatcher", () => {
    it("routes_valid_frames_to_their_handler", () => {
        const { dispatch, handlers } = setup();
        expect(dispatch('{"data_type":3,"log_list":{"0":"a"}}')).toBe(true);
        expect(handlers[DATA_TYPE.LOG_LIST]).toHaveBeenCalledWith({
            data_type: 3,
            log_list: { 0: "a" },
        });
    });

    it("drops_invalid_frames_without_calling_the_handler", () => {
        const { dispatch, handlers } = setup();
        expect(dispatch('{"data_type":0,"num_cpus":"eight"}')).toBe(false);
        expect(handlers[DATA_TYPE.TOPOLOGY]).not.toHaveBeenCalled();
    });

    it("drops_unparseable_input", () => {
        const { dispatch } = setup();
        expect(dispatch("{nope")).toBe(false);
    });

    it("ignores_unknown_types", () => {
        const { dispatch } = setup();
        expect(dispatch('{"data_type":77}')).toBe(false);
    });

    it("routes_stream_lines_on_open_channels_even_on_channel_zero", () => {
        const { dispatch, onStreamLine, handlers } = setup();
        expect(dispatch('{"data_type":0,"log_line":"hello"}')).toBe(true);
        expect(onStreamLine).toHaveBeenCalledWith(0, "hello");
        expect(handlers[DATA_TYPE.TOPOLOGY]).not.toHaveBeenCalled();
    });

    it("does_not_treat_lines_on_closed_channels_as_streams", () => {
        const { dispatch, onStreamLine } = setup();
        expect(dispatch('{"data_type":33,"log_line":"late"}')).toBe(false);
        expect(onStreamLine).not.toHaveBeenCalled();
    });

    it("survives_a_throwing_handler", () => {
        const { dispatch } = setup({
            handlers: {
                [DATA_TYPE.LOG_LIST]: () => {
                    throw new Error("boom");
                },
            },
        });
        expect(dispatch('{"data_type":3,"log_list":{}}')).toBe(false);
    });

    it("applies_the_preprocess_hook", () => {
        const { dispatch, handlers } = setup({
            preprocess: (f) => ({ ...f, log_list: { 9: "mocked" } }),
        });
        dispatch('{"data_type":3,"log_list":{}}');
        expect(handlers[DATA_TYPE.LOG_LIST]).toHaveBeenCalledWith(
            expect.objectContaining({ log_list: { 9: "mocked" } })
        );
    });
});

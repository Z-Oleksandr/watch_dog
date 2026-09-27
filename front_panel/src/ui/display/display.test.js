// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LineBuffer, BUFFER_LIMIT } from "./buffer.js";
import { Display } from "./display.js";

function rows(display) {
    return [...display["_root"].querySelectorAll("p")].map((p) => p.textContent);
}

describe("LineBuffer", () => {
    it("caps_at_the_limit_and_keeps_the_newest", () => {
        const buffer = new LineBuffer(3);
        for (let i = 0; i < BUFFER_LIMIT + 5; i++) {
            buffer.addLine(`l${i}`);
        }
        expect(buffer.length).toBe(BUFFER_LIMIT);
    });

    it("scrolls_up_and_back_to_the_tail", () => {
        const buffer = new LineBuffer(2);
        ["a", "b", "c", "d"].forEach((l) => buffer.addLine(l));
        expect(buffer.oneUp()).toEqual(["b", "c"]);
        expect(buffer.isScrolling).toBe(true);
        expect(buffer.oneUp()).toEqual(["a", "b"]);
        expect(buffer.oneUp()).toBeNull();
        expect(buffer.backToTail()).toEqual(["c", "d"]);
        expect(buffer.isScrolling).toBe(false);
        expect(buffer.oneDown()).toBeNull();
    });
});

describe("Display", () => {
    let root;
    beforeEach(() => {
        vi.useFakeTimers();
        root = document.createElement("div");
        document.body.appendChild(root);
    });
    afterEach(() => {
        vi.useRealTimers();
        root.remove();
    });

    function make(opts = {}) {
        const display = new Display(root, { reducedMotion: true, ...opts });
        display["_root"] = root;
        return display;
    }

    it("creates_fallback_rows_when_unsized", () => {
        const display = make();
        expect(display.rowCount).toBe(8);
        expect(root.getAttribute("aria-live")).toBe("polite");
    });

    it("writes_lines_in_order_and_shifts_when_full", () => {
        const display = make();
        for (let i = 0; i < 10; i++) {
            display.writeLine(`line ${i}`);
        }
        expect(rows(display)[0]).toBe("line 2");
        expect(rows(display)[7]).toBe("line 9");
    });

    it("types_characters_over_time_when_motion_is_allowed", () => {
        const display = make({ reducedMotion: false });
        display.writeLine("abc");
        display.writeLine("def");
        vi.advanceTimersByTime(12 * 3 + 1);
        expect(rows(display)[0]).toBe("abc");
        expect(rows(display)[1]).toBe("");
        vi.advanceTimersByTime(12 * 3 + 1);
        expect(rows(display)[1]).toBe("def");
    });

    it("splits_long_lines", () => {
        const display = make();
        display.writeLine("x".repeat(90));
        expect(rows(display)[0]).toHaveLength(50);
        expect(rows(display)[1]).toHaveLength(40);
    });

    it("pending_choice_updates_in_place_until_final", () => {
        const display = make();
        display.writeLine("Hours:");
        display.pendingChoice("Hours: 1");
        display.pendingChoice("Hours: 2");
        expect(rows(display)[1]).toBe("Hours: 2");
        expect(display.isPending).toBe(true);
        display.writeLine("queued");
        expect(rows(display)[2]).toBe("");
        display.pendingChoice("Hours set: 2", true);
        expect(display.isPending).toBe(false);
        expect(rows(display)[1]).toBe("Hours set: 2");
        expect(rows(display)[2]).toBe("queued");
    });

    it("clear_resets_everything", () => {
        const display = make();
        display.writeLine("a");
        display.pendingChoice("b");
        display.clear();
        expect(rows(display).every((t) => t === "")).toBe(true);
        expect(display.isPending).toBe(false);
        display.writeLine("c");
        expect(rows(display)[0]).toBe("c");
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TimeoutError } from "../util/timing.js";
import { createStore } from "./store.js";

describe("createStore", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("notifies_subscribers_on_set", () => {
        const store = createStore(0);
        const seen = [];
        const unsubscribe = store.subscribe((v) => seen.push(v));
        store.set(1);
        store.update((v) => v + 1);
        unsubscribe();
        store.set(9);
        expect(seen).toEqual([1, 2]);
        expect(store.version).toBe(3);
    });

    it("can_deliver_the_current_value_immediately", () => {
        const store = createStore("a");
        const listener = vi.fn();
        store.subscribe(listener, { immediate: true });
        expect(listener).toHaveBeenCalledWith("a");
    });

    it("next_resolves_with_the_following_value", async () => {
        const store = createStore(null);
        const pending = store.next(1000);
        store.set({ ok: true });
        await expect(pending).resolves.toEqual({ ok: true });
    });

    it("next_rejects_on_timeout", async () => {
        const store = createStore(null);
        const pending = store.next(50);
        vi.advanceTimersByTime(51);
        await expect(pending).rejects.toBeInstanceOf(TimeoutError);
    });
});

import { describe, expect, it } from "vitest";

import { StreamRegistry } from "./streams.js";

describe("StreamRegistry", () => {
    it("opens_streams_on_the_derived_channel_and_names_them", () => {
        const registry = new StreamRegistry();
        registry.setContainerNames({ 0: "db", 3: "web" });
        expect(registry.open(3)).toBe(33);
        expect(registry.has(33)).toBe(true);
        expect(registry.nameFor(33)).toBe("web");
        expect(registry.open(3)).toBe(33);
        expect(registry.size).toBe(1);
    });

    it("falls_back_to_a_generic_name", () => {
        const registry = new StreamRegistry();
        registry.open(5);
        expect(registry.nameFor(55)).toBe("container 5");
    });

    it("closes_and_clears", () => {
        const registry = new StreamRegistry();
        registry.open(1);
        registry.open(2);
        expect(registry.close(11)).toBe(true);
        expect(registry.close(11)).toBe(false);
        expect(registry.channels()).toEqual([22]);
        registry.clear();
        expect(registry.size).toBe(0);
    });

    it("lists_containers_sorted_by_index", () => {
        const registry = new StreamRegistry();
        registry.setContainerNames({ 10: "j", 2: "b" });
        expect(registry.containers()).toEqual([
            [2, "b"],
            [10, "j"],
        ]);
    });
});

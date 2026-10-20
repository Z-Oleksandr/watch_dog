import { describe, expect, it } from "vitest";

import { Random, clamp, randomSeed } from "./random.js";

describe("Random", () => {
    it("repeats_the_sequence_for_a_fixed_seed", () => {
        const a = new Random(42);
        const b = new Random(42);
        const first = Array.from({ length: 20 }, () => a.next());
        expect(Array.from({ length: 20 }, () => b.next())).toEqual(first);
    });

    it("differs_between_seeds", () => {
        expect(new Random(1).next()).not.toBe(new Random(2).next());
    });

    it("stays_within_requested_ranges", () => {
        const random = new Random(7);
        for (let i = 0; i < 1000; i += 1) {
            const float = random.between(-3, 5);
            const int = random.int(2, 4);
            expect(float).toBeGreaterThanOrEqual(-3);
            expect(float).toBeLessThan(5);
            expect([2, 3, 4]).toContain(int);
        }
    });

    it("forks_reproducibly_without_mirroring_the_parent", () => {
        const parent = new Random(9);
        const child = parent.fork();
        const again = new Random(9).fork();
        expect(child.next()).toBe(again.next());
        expect(child.next()).not.toBe(parent.next());
    });
});

describe("randomSeed", () => {
    it("returns_an_unsigned_32_bit_integer", () => {
        const seed = randomSeed();
        expect(Number.isInteger(seed)).toBe(true);
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThan(2 ** 32);
    });
});

describe("clamp", () => {
    it("limits_values_to_the_range", () => {
        expect(clamp(-1, 0, 10)).toBe(0);
        expect(clamp(11, 0, 10)).toBe(10);
        expect(clamp(5, 0, 10)).toBe(5);
    });
});

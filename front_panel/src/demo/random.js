const UINT32_RANGE = 2 ** 32;

/**
 * Seeded pseudo-random source (mulberry32). Every simulated value in the demo
 * draws from one of these, so a fixed seed reproduces a whole session.
 */
export class Random {
    #state;

    /** @param {number} seed  Any integer; only the low 32 bits are used. */
    constructor(seed) {
        this.#state = seed >>> 0;
    }

    /** @returns {number} a float in [0, 1). */
    next() {
        this.#state = (this.#state + 0x6d2b79f5) >>> 0;
        let t = this.#state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
    }

    /** @returns {number} a float in [min, max). */
    between(min, max) {
        return min + (max - min) * this.next();
    }

    /** @returns {number} an integer in [min, max]. */
    int(min, max) {
        return Math.floor(this.between(min, max + 1));
    }

    /** @param {number} probability  Chance of `true`, in [0, 1]. */
    chance(probability) {
        return this.next() < probability;
    }

    /**
     * @template T
     * @param {readonly T[]} items  Must not be empty.
     * @returns {T}
     */
    pick(items) {
        return items[Math.floor(this.next() * items.length)];
    }

    /** A new independent source derived from this one, for a separate subsystem. */
    fork() {
        return new Random(Math.floor(this.next() * UINT32_RANGE));
    }
}

/** A seed from the platform's cryptographic source, so every visitor sees a different machine. */
export function randomSeed() {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
}

/** @returns {number} `value` limited to [min, max]. */
export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

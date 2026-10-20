import { TimeoutError } from "../util/timing.js";

/**
 * Minimal observable value holder. Renderers subscribe; frame handlers set.
 * @template T
 * @param {T} initial
 */
export function createStore(initial) {
    let value = initial;
    let version = 0;
    const listeners = new Set();

    function notify() {
        for (const listener of [...listeners]) {
            listener(value);
        }
    }

    return {
        get: () => value,
        /** @param {T} next */
        set(next) {
            value = next;
            version += 1;
            notify();
        },
        /** @param {(current: T) => T} fn */
        update(fn) {
            this.set(fn(value));
        },
        get version() {
            return version;
        },
        /**
         * @param {(value: T) => void} listener
         * @param {{ immediate?: boolean }} [opts]
         * @returns {() => void} unsubscribe
         */
        subscribe(listener, { immediate = false } = {}) {
            listeners.add(listener);
            if (immediate) {
                listener(value);
            }
            return () => listeners.delete(listener);
        },
        /**
         * Resolves with the next value written after this call, or rejects
         * with `TimeoutError`. Used to correlate a request with its response.
         * @param {number} timeoutMs
         * @returns {Promise<T>}
         */
        next(timeoutMs) {
            return new Promise((resolve, reject) => {
                let unsubscribe = () => {};
                const timer = setTimeout(() => {
                    unsubscribe();
                    reject(new TimeoutError(`no update within ${timeoutMs} ms`));
                }, timeoutMs);
                unsubscribe = this.subscribe((next) => {
                    clearTimeout(timer);
                    unsubscribe();
                    resolve(next);
                });
            });
        },
    };
}

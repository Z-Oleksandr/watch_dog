/**
 * Promise helpers around timers. Every wait is cancellable through an
 * `AbortSignal` so components can tear down without leaving callbacks behind.
 */

export class AbortedError extends Error {
    constructor(message = "aborted") {
        super(message);
        this.name = "AbortedError";
    }
}

export class TimeoutError extends Error {
    constructor(message = "timed out") {
        super(message);
        this.name = "TimeoutError";
    }
}

/**
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
export function delay(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal && signal.aborted) {
            reject(new AbortedError());
            return;
        }
        const handle = setTimeout(() => {
            if (signal) {
                signal.removeEventListener("abort", onAbort);
            }
            resolve();
        }, ms);
        function onAbort() {
            clearTimeout(handle);
            reject(new AbortedError());
        }
        if (signal) {
            signal.addEventListener("abort", onAbort, { once: true });
        }
    });
}

/**
 * Rejects with `TimeoutError` when `promise` does not settle within `ms`.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} [what]
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms, what = "operation") {
    let handle;
    const timeout = new Promise((_, reject) => {
        handle = setTimeout(() => reject(new TimeoutError(`${what} timed out after ${ms} ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(handle));
}

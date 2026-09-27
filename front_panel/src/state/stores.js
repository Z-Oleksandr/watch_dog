import { createStore } from "./store.js";

/**
 * One store per engine frame type. Handlers write the validated frame;
 * UI modules subscribe. Nothing else keeps a copy of frame data.
 */
export function createStores() {
    return Object.freeze({
        topology: createStore(null),
        systemInfo: createStore(null),
        stats: createStore(null),
        logList: createStore(null),
        logData: createStore(null),
        containerList: createStore(null),
    });
}

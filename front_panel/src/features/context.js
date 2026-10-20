import { withTimeout } from "../util/timing.js";

/**
 * @typedef {object} PanelContext
 * @property {import("../transport/socket.js").Transport} transport
 * @property {ReturnType<typeof import("../state/stores.js").createStores>} stores
 * @property {import("../state/streams.js").StreamRegistry} streams
 * @property {import("../ui/display/display.js").Display} display
 * @property {import("../ui/panel/panel.js").Panel} panel
 * @property {import("../render/controls/controls.js").ControlPanel & { resetButtons(): void }} controls
 * @property {(type: string, message: number, store: object, timeoutMs: number) => Promise<object>} request
 */

/**
 * Sends a request and resolves with the next frame written to `store`.
 * Rejects when the send is dropped or no frame arrives in time.
 */
export function createRequest(transport) {
    return function request(type, message, store, timeoutMs) {
        const pending = store.next(timeoutMs);
        if (!transport.send(type, message)) {
            pending.catch(() => {});
            return Promise.reject(new Error(`request ${type} not sent: socket ${transport.state}`));
        }
        return withTimeout(pending, timeoutMs, type);
    };
}

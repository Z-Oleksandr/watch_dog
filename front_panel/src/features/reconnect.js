import { STATE } from "../transport/socket.js";

/** "reset WS": drop the socket and reconnect right away. */
export function resetConnection(ctx) {
    const { display, transport, panel } = ctx;
    if (transport.state === STATE.CONNECTING) {
        display.writeLine("Stop spamming that button! Reset is in progress.");
        return;
    }
    display.writeLine("Resetting WebSocket connection...");
    panel.zero();
    transport.reconnect();
}

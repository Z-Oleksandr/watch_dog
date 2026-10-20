import { MAX_LOG_HOURS, REQUEST_TYPE } from "../protocol/messages.js";

/**
 * "logging": pick a duration in hours with +/- and send `start_log`.
 * @param {import("./context.js").PanelContext} ctx
 * @param {() => void} onDone  Restores the extra-functions menu.
 */
export function startLogger(ctx, onDone) {
    const { display, controls, transport } = ctx;
    let hours = 1;

    display.writeLine("Set time period for which you want to record logs:");
    display.pendingChoice(`Hours: ${hours}`);

    controls.buttons[0].assign(() => {
        if (hours < MAX_LOG_HOURS) {
            hours += 1;
            display.pendingChoice(`Hours: ${hours}`);
        }
    }, "+");
    controls.buttons[1].assign(() => {
        if (hours > 1) {
            hours -= 1;
            display.pendingChoice(`Hours: ${hours}`);
        }
    }, "-");
    controls.buttons[2].assign(() => {
        display.pendingChoice(`Hours set: ${hours}`, true);
        display.writeLine(`Sending request: ${REQUEST_TYPE.START_LOG} ${hours}`);
        if (!transport.send(REQUEST_TYPE.START_LOG, hours)) {
            display.writeLine("Request not sent: no connection to engine");
        }
        onDone();
    }, "start");
}

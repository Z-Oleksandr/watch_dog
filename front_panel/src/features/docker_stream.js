import { encodeStreamRequest } from "../protocol/channels.js";
import { REQUEST_TYPE } from "../protocol/messages.js";
import { log } from "../util/logger.js";

const LIST_TIMEOUT_MS = 5000;

/**
 * "docker log": fetch the container list, pick one with +/- and start its
 * output stream into a portal.
 * @param {import("./context.js").PanelContext} ctx
 * @param {() => void} onDone
 */
export async function startContainerStdout(ctx, onDone) {
    const { display, controls, transport, streams, stores } = ctx;

    display.writeLine("Getting containers list...");
    let frame;
    try {
        frame = await ctx.request(
            REQUEST_TYPE.GET_CONTAINERS,
            0,
            stores.containerList,
            LIST_TIMEOUT_MS
        );
    } catch (err) {
        log.warn("docker", "container list not received", { err });
        display.writeLine("No container list received from engine");
        onDone();
        return;
    }

    streams.setContainerNames(frame.list);
    const containers = streams.containers();
    if (containers.length === 0) {
        display.writeLine("No containers found");
        onDone();
        return;
    }
    for (const [index, name] of containers) {
        display.writeLine(`${index}: ${name}`);
    }

    let position = 0;
    const indexAt = (p) => containers[p][0];
    display.writeLine("Choose container to stream output:");
    display.pendingChoice(`Container: ${indexAt(position)}`);

    controls.buttons[0].assign(() => {
        if (position < containers.length - 1) {
            position += 1;
            display.pendingChoice(`Container: ${indexAt(position)}`);
        }
    }, "+");
    controls.buttons[1].assign(() => {
        if (position > 0) {
            position -= 1;
            display.pendingChoice(`Container: ${indexAt(position)}`);
        }
    }, "-");
    controls.buttons[2].assign(() => {
        const index = indexAt(position);
        display.pendingChoice(`Container ${index} selected`, true);
        streams.open(index);
        const message = encodeStreamRequest(index);
        display.writeLine(`Sending request: ${REQUEST_TYPE.START_CONTAINER_OUTPUT} ${message}`);
        if (!transport.send(REQUEST_TYPE.START_CONTAINER_OUTPUT, message)) {
            display.writeLine("Request not sent: no connection to engine");
        }
        onDone();
    }, "select");
}

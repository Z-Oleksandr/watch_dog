import { REQUEST_TYPE } from "../protocol/messages.js";
import { log } from "../util/logger.js";

const REQUEST_TIMEOUT_MS = 5000;
const CANCEL = -1;

/** @returns {Array<[number, string]>} log list entries sorted by index */
function sortedLogs(logList) {
    return Object.entries(logList)
        .map(([index, name]) => [Number(index), name])
        .sort((a, b) => a[0] - b[0]);
}

async function requestLogList(ctx) {
    const frame = await ctx.request(
        REQUEST_TYPE.GET_LOG_LIST,
        0,
        ctx.stores.logList,
        REQUEST_TIMEOUT_MS
    );
    return sortedLogs(frame.log_list);
}

async function requestLogData(ctx, index) {
    return ctx.request(REQUEST_TYPE.GET_LOG_DATA, index, ctx.stores.logData, REQUEST_TIMEOUT_MS);
}

async function openChart(ctx, title, frame) {
    const { openChartWindow } = await import("../render/chart/log_chart.js");
    const topology = ctx.stores.topology.get();
    openChartWindow({
        title,
        cpu: frame.cnr_data.cpu,
        ram: frame.cnr_data.ram,
        net: frame.net_data.network,
        ramMax: topology ? topology.init_ram_total : undefined,
        onClose: () => ctx.display.writeLine("Chart window closed."),
    });
}

/** "get chart": list the logs, pick one, fetch it, then show it on demand. */
export async function spawnChart(ctx) {
    const { display, controls } = ctx;
    display.writeLine("Getting the log list...");

    let logs;
    try {
        logs = await requestLogList(ctx);
    } catch (err) {
        log.warn("chart", "log list not received", { err });
        display.writeLine("Error getting log list.");
        return;
    }
    if (logs.length === 0) {
        display.writeLine("There are 0 logs currently");
        display.writeLine("Start new log function");
        return;
    }

    display.writeLine("Log list:");
    for (const [index, name] of logs) {
        display.writeLine(`${index}: ${name}`);
    }
    display.writeLine("Pick log to display ( -1 to cancel )");

    let position = 0;
    display.pendingChoice(`Log number: ${logs[position][0]}`);

    controls.buttons[0].assign(async () => {
        if (position === CANCEL) {
            display.pendingChoice("Log file pick cancelled", true);
            controls.resetButtons();
            return;
        }
        const [index, name] = logs[position];
        display.pendingChoice(`Log file picked: ${index}`, true);
        controls.resetButtons();
        let frame;
        try {
            frame = await requestLogData(ctx, index);
        } catch (err) {
            log.warn("chart", "log data not received", { index, err });
            display.writeLine("Error getting log data");
            return;
        }
        display.writeLine("Log data received.");
        controls.buttons[0].assign(() => {
            openChart(ctx, name, frame).catch((err) => {
                log.error("chart", "could not open chart", { err });
                display.writeLine("Chart failed to open");
            });
            controls.resetButtons();
        }, "show chart");
        display.writeLine("Chart available to show");
    }, "accept");

    controls.buttons[1].assign(() => {
        if (position === CANCEL) {
            position = 0;
        } else if (position < logs.length - 1) {
            position += 1;
        } else {
            return;
        }
        display.pendingChoice(`Log number: ${logs[position][0]}`);
    }, "+");

    controls.buttons[2].assign(() => {
        if (position > 0) {
            position -= 1;
            display.pendingChoice(`Log number: ${logs[position][0]}`);
        } else if (position === 0) {
            position = CANCEL;
            display.pendingChoice("Log number: cancel?");
        }
    }, "-");
}

/** "latest log": fetch and show the most recent log without a picker. */
export async function showLatestChart(ctx) {
    const { display } = ctx;
    display.writeLine("Getting latest log chart");
    try {
        const logs = await requestLogList(ctx);
        if (logs.length === 0) {
            display.writeLine("There are 0 logs currently");
            display.writeLine("Start new log function");
            return;
        }
        const [index, name] = logs[logs.length - 1];
        const frame = await requestLogData(ctx, index);
        await openChart(ctx, name, frame);
    } catch (err) {
        log.warn("chart", "latest chart failed", { err });
        display.writeLine("Error getting latest log");
    }
}

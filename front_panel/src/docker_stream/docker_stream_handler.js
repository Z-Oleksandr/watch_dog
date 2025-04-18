import { getDisplay2 } from "../dsiplay2/display2";

const display = getDisplay2();

export function write_container_log_to_display(rawLog) {
    const [rawTimeStamp, ...messageParts] = rawLog.split(" ");
    const message = messageParts.join(" ");

    const formattedTime = formatTimestamp(rawTimeStamp);

    const cleanMessage = message.replace(/\x1b\[[0-9;]*m/g, "");

    const log = `[${formattedTime}] => ${cleanMessage}`;
    display.write_line(log);
}

function formatTimestamp(time) {
    try {
        const date = new Date(time);
        return date.toLocaleString(undefined, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch (e) {
        return time;
    }
}

import { getDisplay2 } from "./display2";

const display = getDisplay2();

export async function displayLogList(logList) {
    if (logList && logList.length != 0) {
        display.write_line("Log list:");
        logList.forEach(([index, log]) => {
            console.log(index + ": " + log);
            display.write_line(index + ": " + log);
        });

        display.write_line("Pick log to display ( -1 to cancel )");

        if (display.textQueue.length == 0) {
            return new Promise((res, _) => res());
        }
    }
}

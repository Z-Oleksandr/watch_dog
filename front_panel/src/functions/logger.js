import { getDisplay2 } from "../dsiplay2/display2";
import { new_assign_button } from "../button_functions/button_functions";
import { sendWSMessage } from "../script";
import { init_functions } from "./init_functions";

const display = getDisplay2();

class LoggerStartRequest {
    constructor(type, time) {
        this.type = type;
        this.time = time;
    }
}

export function start_logger() {
    display.write_line("Set time period for which you want to record logs:");
    let logStartRequest = new LoggerStartRequest("start_log", 1);
    setTimeout(() => display.pending_choice("Hours: 1", false), 500);
    buttonsLogOptions(logStartRequest);
}

function buttonsLogOptions(logStartRequest) {
    new_assign_button(
        0,
        () => {
            display.pending_choice(`Hours set: ${logStartRequest.time}`, true);
            display.write_line(
                "Sending request: " +
                    logStartRequest.type +
                    " " +
                    logStartRequest.time
            );
            sendWSMessage(logStartRequest.type, logStartRequest.time);
            init_functions();
        },
        "start"
    );
    new_assign_button(
        1,
        () => {
            let count = logStartRequest.time + 1;
            logStartRequest.time = count;
            display.pending_choice(`Hours: ${count}`, false);
        },
        "+"
    );
    new_assign_button(
        2,
        () => {
            if (logStartRequest.time > 1) {
                let count = logStartRequest.time - 1;
                logStartRequest.time = count;
                display.pending_choice(`Hours: ${count}`, false);
            }
        },
        "-"
    );
}

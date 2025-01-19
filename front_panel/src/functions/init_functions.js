import { toggle_switches } from "../control2/toggle_switch";
import { buttons } from "../control2/button";
import { new_assign_button } from "../button_functions/button_functions";
import { getDisplay2 } from "../dsiplay2/display2";
import { sendWSMessage } from "../script";
import { start_logger } from "./logger";

let display = getDisplay2();

export function init_functions() {
    if (toggle_switches[1].state) {
        toggle_switches[1].toggle().then(() => {
            display.write_line("Enable extra functions");
            extraButton0();
            extraButton1();
            extraButton2();
        });
    } else {
        display.write_line("Enable extra functions");
        extraButton0();
        extraButton1();
        extraButton2();
    }
}

export function disable_functions() {
    resetButtons();
    if (display.terminalPending) {
        display.pending_choice("Canceled", true);
    }
    display.write_line("Disable extra functions");
}

function extraButton0() {
    new_assign_button(
        0,
        () => {
            display.write_line("Start logging setup");
            setTimeout(() => start_logger(), 1000);
        },
        "logging"
    );
}

function extraButton1() {
    new_assign_button(
        1,
        () => {
            display.write_line("Nothing here for now");
        },
        "button 1"
    );
}

function extraButton2() {
    new_assign_button(
        2,
        () => {
            display.write_line("Nothing here for now");
        },
        "button 2"
    );
}

export function resetButtons() {
    for (let i = 0; i < 3; i++) {
        buttons[i].resetToDefault();
    }
}

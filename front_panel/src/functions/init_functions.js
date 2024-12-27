import { toggle_switches } from "../control2/toggle_switch";
import { buttons } from "../control2/button";
import { getDisplay2 } from "../dsiplay2/display2";
import { sendWSMessage } from "../script";

let display = getDisplay2();

export function init_functions() {
    display.write_line("Displaying extra functions.");
    extraButton0();
    extraButton1();
    extraButton2();
}

export function disable_functions() {
    resetButtons();
    display.write_line("Disable extra functions.");
}

function extraButton0() {
    buttons[0].addDoing(() => {
        display.write_line("Start logging setup");
    });
    buttons[0].label.updateText("Logging");
}

function extraButton1() {
    const button1 = buttons[1];
    button1.addDoing(() => {
        display.write_line("Nothing here for now.");
    });
    button1.label.updateText("button 1");
}

function extraButton2() {
    const button2 = buttons[2];
    button2.addDoing(() => {
        display.write_line("Nothing here for now.");
    });
    button2.label.updateText("button 2");
}

function resetButtons() {
    for (let i = 0; i < 3; i++) {
        buttons[i].resetToDefault();
    }
}

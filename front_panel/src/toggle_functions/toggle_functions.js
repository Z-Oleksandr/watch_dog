import { toggle_switches } from "../control2/toggle_switch";
import { getDisplay2 } from "../dsiplay2/display2";
import { max_net_gauges } from "../server_connection/server_connection";
import { init_functions, disable_functions } from "../functions/init_functions";
import {
    default_buttons,
    new_assign_button,
} from "../button_functions/button_functions";
import { show_latest_chart } from "../chart/chart";

const display2 = getDisplay2();

export function assign_toggle_0() {
    try {
        toggle_switches[0].addDoing(
            () => {
                init_functions();
            },
            () => {
                disable_functions();
            }
        );
        toggle_switches[0].label.updateText("Functions");
        toggle_switches[0].defaultLabel = "Functions";
    } catch {
        setTimeout(assign_toggle_0, 1000);
    }
}

export function assign_toggle_1() {
    try {
        toggle_switches[1].addDoing(
            () => {
                if (toggle_switches[0].state) {
                    toggle_switches[0].toggle().then(() => {
                        display2.write_line("Enable extra buttons");
                        extraButtons();
                    });
                } else {
                    extraButtons();
                }
                function extraButtons() {
                    new_assign_button(
                        0,
                        () => {
                            show_latest_chart();
                        },
                        "latest log"
                    );
                    new_assign_button(
                        1,
                        () => {
                            display2.write_line("Nothing here for now");
                        },
                        "button 1"
                    );
                    new_assign_button(
                        2,
                        () => {
                            display2.write_line("Nothing here for now");
                        },
                        "button 2"
                    );
                }
            },
            () => {
                default_buttons();
            }
        );
        toggle_switches[1].label.updateText("ext buttons");
        toggle_switches[1].defaultLabel = "ext buttons";
    } catch {
        setTimeout(assign_toggle_1, 1000);
    }
}

export function assign_toggle_2() {
    try {
        toggle_switches[2].addDoing(
            () => {
                display2.write_line("Testing net gauges");
                max_net_gauges(true);
            },
            () => {
                display2.write_line("Finished testing net gauges");
                max_net_gauges(false);
            }
        );
        toggle_switches[2].label.updateText("net_g test");
        toggle_switches[2].defaultLabel = "net_g test";
    } catch {
        setTimeout(assign_toggle_2, 1000);
    }
}

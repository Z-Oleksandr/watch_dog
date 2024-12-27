import { toggle_switches } from "../control2/toggle_switch";
import { getDisplay2 } from "../dsiplay2/display2";
import { max_net_gauges } from "../server_connection/server_connection";
import { init_functions, disable_functions } from "../functions/init_functions";

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

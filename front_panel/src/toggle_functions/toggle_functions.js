import { toggle_switches } from "../control2/toggle_switch";
import { getDisplay2 } from "../dsiplay2/display2";
import { max_net_gauges } from "../server_connection/server_connection";
import { sendWSMessage } from "../script";

const display2 = getDisplay2();

export function assign_toggle_0() {
    try {
        toggle_switches[0].addDoing(
            () => {
                display2.write_line("Sending test message to engine");
                sendWSMessage("request", "Test request.");
            },
            () => {
                display2.write_line("Communication finished.");
                sendWSMessage("info", "Finish test request");
            }
        );
        toggle_switches[0].label.updateText("Test request");
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
    } catch {
        setTimeout(assign_toggle_2, 1000);
    }
}

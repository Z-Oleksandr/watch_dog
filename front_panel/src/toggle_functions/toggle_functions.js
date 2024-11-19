import { toggle_switches } from "../control2/toggle_switch";
import { getDisplay2 } from "../dsiplay2/display2";
import { max_net_gauges } from "../server_connection/server_connection";

export function assign_toggle_2() {
  const display2 = getDisplay2();
  try {
    toggle_switches[2].addDoing(
      () => {
        display2.write_line("Testing net gauges");
        max_net_gauges(true);
      }, 
    () => {
      display2.write_line("Finished testing net gauges");
      max_net_gauges(false);
    })
  } catch {
    setTimeout(assign_toggle_2, 1000);
  }
}
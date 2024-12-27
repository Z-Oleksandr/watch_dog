import { buttons } from "../control2/button";
import { getWS, resetWS, isWSConnected } from "../script";
import { getDisplay2 } from "../dsiplay2/display2";
import { zero_gauges } from "../server_connection/server_connection";
import { spawn_chart } from "../chart/chart";

let resetInProgress = false;

export async function reconnectWS() {
    let ws = await getWS();
    const display2 = getDisplay2();
    if (!resetInProgress) {
        setResetState(true);
        display2.write_line("Resetting WebSocket connection...");
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
        zero_gauges();
        isWSConnected(ws);
        setTimeout(() => {
            ws = new WebSocket(`ws://${window.location.hostname}:8999`);
            resetWS(ws);
        }, 2000);
    } else {
        display2.write_line("Stop spamming that button! Reset is in progress.");
    }
}

export function setResetState(state) {
    resetInProgress = state;
}

export function assign_button_0() {
    try {
        buttons[0].addDoing(() => spawn_chart());
        buttons[0].label.updateText("show chart");
    } catch {
        setTimeout(assign_button_0, 1000);
    }
}

export function assign_button_1() {
    try {
        const display2 = getDisplay2();
        buttons[1].addDoing(() => display2.clear_terminal());
        buttons[1].label.updateText("clear D2");
    } catch {
        setTimeout(assign_button_1, 1000);
    }
}

export function assign_button_2() {
    try {
        buttons[2].addDoing(() => reconnectWS());
        buttons[2].label.updateText("reset WS");
    } catch {
        setTimeout(assign_button_2, 1000);
    }
}

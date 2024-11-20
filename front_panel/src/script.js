import { indicators } from "./control2/indicator";
import "./control2/main_control2";
import { setResetState } from "./button_functions/button_functions";
import { getDisplay2 } from "./dsiplay2/display2";
import {
    server_communication,
    zero_gauges,
} from "./server_connection/server_connection";

let ws = new WebSocket(`https://${window.location.hostname}/wss`);

let connectionAt = `https://${window.location.hostname}/wss`;
console.log("WS connection at: " + connectionAt);

export function isMobile() {
    const regex =
        /Mobi|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    return regex.test(navigator.userAgent);
}

const display2 = getDisplay2();

// WebSocket
export function getWS() {
    return new Promise((res, rej) => {
        if (ws) {
            res(ws);
        } else {
            rej("WebSocket not yet initialized.");
        }
    });
}

export function resetWS(newWS) {
    ws = newWS;
    server_communication(ws);
    setTimeout(() => {
        setResetState(false);
        if (ws.readyState === WebSocket.OPEN) {
            display2.write_line("WebSocket connection reset complete.");
            display2.write_line("WS connection at: " + connectionAt);
        } else {
            display2.write_line(
                "Failed to reset WebSocket connection. Try again."
            );
        }
    }, 5000);
}

export function isWSConnected(ws) {
    const state = ws.readyState === WebSocket.OPEN;
    if (state) {
        indicators[0].on();
        indicators[2].off();
    } else {
        if (indicators[2].state == false && !display2.initialSetupState) {
            display2.write_line("WebSocket connection closed");
            try {
                zero_gauges();
            } catch {
                console.log("Gauges were not yet initialised");
            }
        }
        indicators[0].off();
        indicators[2].on();
    }
    return state;
}

setTimeout(() => {
    setInterval(() => isWSConnected(ws), 5000);
}, 3000);

ws.onopen = function () {
    console.log("WebSocket connection esablished");
    server_communication(ws);
    setTimeout(() => {
        isWSConnected(ws);
        display2.write_line("WebSocket connection established");
        display2.write_line("WS connection at: " + connectionAt);
    }, 5005);
};

ws.onerror = function (error) {
    console.error("WebSocket error: ", error);
    display2.write_line("Websocket connection error.");
    display2.write_line("Try to reset Websocket.");
};

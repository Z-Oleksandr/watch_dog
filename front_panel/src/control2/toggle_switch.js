import { animateEmission } from "./indicator";
import { getDisplay2 } from "../dsiplay2/display2";

export class ToggleSwitch {
    constructor(number, model, action, mixer, state, label) {
        this.number = number;
        this.model = model;
        this.action = action;
        this.mixer = mixer;
        this.state = state;
        this.label = label;
        this.doing = [null, null];
    }

    addDoing(callback0, callback1) {
        if (
            typeof callback0 === "function" &&
            typeof callback1 === "function"
            ) {
            this.doing[0] = callback0;
            this.doing[1] = callback1;
        } else {
            console.warn("Attempt to assing not a function to t_switch doing.");
        }
    }

    toggle() {
        if (this.action) {
            this.state = !this.state;
            this.action.timeScale = this.state ? 1 : -1;
            this.action.paused = false;
            this.action.play();
        }
        if (this.doing[0] && this.doing[1]) {
            if (this.state) {
                setTimeout(() => {
                    this.doing[0]();
                }, 200);
            } else {
                setTimeout(() => {
                    this.doing[1]();
                }, 200);
            }
        } else {
            const display2 = getDisplay2();
            display2.write_line("No function assigned to this t_switch");
        }
    }
}

export let toggle_switches = [];

export function addToggleSwitch(i, model, action, mixer, label) {
    const toggleSwitch = new ToggleSwitch(
        i,
        model,
        action,
        mixer,
        false,
        label
    );
    toggle_switches.push(toggleSwitch);
    toggle_switches.sort((a, b) => a.number - b.number);
}

export function updateToggleMixers(delta) {
    toggle_switches.forEach((toggle_switch) => {
        toggle_switch.mixer.update(delta);
    });
}

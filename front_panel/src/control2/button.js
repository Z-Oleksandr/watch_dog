import { getDisplay2 } from "../dsiplay2/display2";

export class Button3D {
    constructor(number, model, action, mixer, label) {
        this.number = number;
        this.model = model;
        this.action = action;
        this.mixer = mixer;
        this.label = label;
        this.defaultLabel = null;
        this.doing = null;
        this.defaultDoing = null;
    }

    addDoing(callback) {
        if (callback && typeof callback === "function") {
            this.doing = callback;
            if (!this.defaultDoing) {
                this.defaultDoing = this.doing;
            }
        } else {
            console.warn("Attempt to assing not a function to button doing.");
        }
    }

    press() {
        if (this.action) {
            this.action.paused = false;
            this.action.play();
            this.action.reset();
        }
        if (this.doing) {
            setTimeout(() => {
                this.doing();
            }, 200);
        } else {
            const display2 = getDisplay2();
            display2.write_line("No function assigned to this button");
        }
    }

    resetToDefault() {
        if (this.defaultDoing) {
            this.doing = this.defaultDoing;
        }
        if (this.defaultLabel) {
            this.label.updateText(this.defaultLabel);
        }
    }
}

export let buttons = [];

export function addButton3D(number, model, action, mixer, label) {
    const button3D = new Button3D(number, model, action, mixer, label);
    buttons.push(button3D);
    buttons.sort((a, b) => b.number - a.number);
}

export function updateButton3DMixers(delta) {
    buttons.forEach((button3D) => {
        button3D.mixer.update(delta);
    });
}

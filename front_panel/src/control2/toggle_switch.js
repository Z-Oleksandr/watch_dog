export class ToggleSwitch {
    constructor(model, action, mixer, state) {
        this.model = model;
        this.action = action;
        this.mixer = mixer;
        this.state = state;
    }

    toggle() {
        if (this.action) {
            this.state = !this.state;
            this.action.timeScale = this.state ? 1 : -1;
            this.action.paused = false;
            this.action.play();
        }
    }
}

export let toggle_switches = [];

export function addToggleSwitch(model, action, mixer) {
    const toggleSwitch = new ToggleSwitch(model, action, mixer, false);
    toggle_switches.push(toggleSwitch);
}

export function updateToggleMixers(delta) {
    toggle_switches.forEach((toggle_switch) => {
        toggle_switch.mixer.update(delta);
    });
}

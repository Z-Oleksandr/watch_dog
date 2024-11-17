export class Button3D {
    constructor(model, action, mixer) {
        this.model = model;
        this.action = action;
        this.mixer = mixer;
    }

    press() {
        if (this.action) {
            this.action.paused = false;
            this.action.play();
            this.action.reset();
        }
    }
}

export let buttons = [];

export function addButton3D(model, action, mixer) {
    const button3D = new Button3D(model, action, mixer);
    buttons.push(button3D);
}

export function updateButton3DMixers(delta) {
    buttons.forEach((button3D) => {
        button3D.mixer.update(delta);
    });
}

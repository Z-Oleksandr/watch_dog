const EMISSION_ON = 20;
const EMISSION_OFF = 1;
const BLINK_INTERVAL_MS = 500;
const LAMP_MESH_NAME = "Sphere";

/** A lamp: on, off, or blinking. */
export class Indicator {
    #lit = false;
    #blinkTimer = null;
    #onChange;

    constructor(number, model, mixer, label, { onChange } = {}) {
        this.number = number;
        this.model = model;
        this.mixer = mixer;
        this.label = label;
        this.#onChange = onChange || (() => {});
    }

    get isOn() {
        return this.#lit;
    }

    get isBlinking() {
        return this.#blinkTimer !== null;
    }

    on() {
        this.stopBlinking();
        this.#setLit(true);
    }

    off() {
        this.stopBlinking();
        this.#setLit(false);
    }

    blink() {
        if (this.isBlinking) {
            return;
        }
        this.#blinkTimer = setInterval(() => this.#setLit(!this.#lit), BLINK_INTERVAL_MS);
    }

    stopBlinking() {
        if (this.#blinkTimer !== null) {
            clearInterval(this.#blinkTimer);
            this.#blinkTimer = null;
        }
    }

    destroy() {
        this.stopBlinking();
    }

    #setLit(lit) {
        this.#lit = lit;
        const intensity = lit ? EMISSION_ON : EMISSION_OFF;
        this.model.traverse((child) => {
            if (child.isMesh && child.name === LAMP_MESH_NAME && child.material) {
                child.material.emissiveIntensity = intensity;
            }
        });
        this.#onChange();
    }
}

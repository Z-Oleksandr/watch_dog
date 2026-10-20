import { PRESS_DELAY_MS } from "./button.js";

/** A two-position switch with an `on` and an `off` action. */
export class ToggleSwitch {
    #defaultActions = null;
    #defaultLabel = null;
    #actions = null;
    #timer = null;

    constructor(number, model, animation, mixer, label) {
        this.number = number;
        this.model = model;
        this.animation = animation;
        this.mixer = mixer;
        this.label = label;
        this.state = false;
    }

    setDefault(onAction, offAction, text) {
        this.#defaultActions = [onAction, offAction];
        this.#defaultLabel = text;
        this.assign(onAction, offAction, text);
    }

    assign(onAction, offAction, text) {
        if (typeof onAction !== "function" || typeof offAction !== "function") {
            throw new TypeError(`toggle ${this.number}: actions must be functions`);
        }
        this.#actions = [onAction, offAction];
        this.label.setText(text);
    }

    resetToDefault() {
        if (this.#defaultActions) {
            this.#actions = this.#defaultActions;
            this.label.setText(this.#defaultLabel);
        }
    }

    /**
     * Flips the switch, plays the animation and runs the matching action.
     * @returns {Promise<boolean>} resolves after the action ran; false when none is assigned.
     */
    toggle() {
        this.state = !this.state;
        if (this.animation) {
            this.animation.timeScale = this.state ? 1 : -1;
            this.animation.paused = false;
            this.animation.play();
        }
        if (!this.#actions) {
            return Promise.resolve(false);
        }
        const action = this.state ? this.#actions[0] : this.#actions[1];
        return new Promise((resolve) => {
            clearTimeout(this.#timer);
            this.#timer = setTimeout(() => {
                action();
                resolve(true);
            }, PRESS_DELAY_MS);
        });
    }

    destroy() {
        clearTimeout(this.#timer);
    }
}

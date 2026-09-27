/** Delay between the press animation starting and its action firing. */
export const PRESS_DELAY_MS = 200;

/**
 * A push button in the 3D panel. Holds a default action/label (set once at
 * boot) and a current one that features swap in and out.
 */
export class Button {
    #defaultAction = null;
    #defaultLabel = null;
    #action = null;
    #timer = null;

    constructor(number, model, animation, mixer, label) {
        this.number = number;
        this.model = model;
        this.animation = animation;
        this.mixer = mixer;
        this.label = label;
    }

    get hasAction() {
        return typeof this.#action === "function";
    }

    setDefault(action, text) {
        this.#defaultAction = action;
        this.#defaultLabel = text;
        this.assign(action, text);
    }

    assign(action, text) {
        if (typeof action !== "function") {
            throw new TypeError(`button ${this.number}: action must be a function`);
        }
        this.#action = action;
        this.label.setText(text);
    }

    resetToDefault() {
        if (this.#defaultAction) {
            this.#action = this.#defaultAction;
            this.label.setText(this.#defaultLabel);
        }
    }

    /**
     * Plays the press animation and fires the action shortly after.
     * @returns {boolean} whether an action was assigned.
     */
    press() {
        if (this.animation) {
            this.animation.paused = false;
            this.animation.play();
            this.animation.reset();
        }
        if (!this.#action) {
            return false;
        }
        const action = this.#action;
        clearTimeout(this.#timer);
        this.#timer = setTimeout(() => action(), PRESS_DELAY_MS);
        return true;
    }

    destroy() {
        clearTimeout(this.#timer);
    }
}

import { delay } from "../../util/timing.js";
import { log } from "../../util/logger.js";

/** Visual pacing of the power-up: sweep after connect, reveal after the sweep. */
const CONNECT_DELAY_MS = 2000;
const REVEAL_DELAY_MS = 3000;
/** Matches the gate transition in control_window_style.css. */
const GATE_TRANSITION_MS = 1500;
const GATE_FALLBACK_MS = 1700;

/**
 * Runs the power-up animation exactly once: gauge sweep, info reveal, then
 * the control-panel gates open. `run()` resolves when the gates are open.
 */
export class BootSequence {
    #panel;
    #info;
    #cover;
    #reducedMotion;
    #done = null;

    /**
     * @param {{ panel: { sweep(): void }, info: { reveal(): void },
     *           cover: HTMLElement | null, reducedMotion?: boolean }} deps
     */
    constructor({ panel, info, cover, reducedMotion = false }) {
        this.#panel = panel;
        this.#info = info;
        this.#cover = cover;
        this.#reducedMotion = reducedMotion;
    }

    get hasRun() {
        return this.#done !== null;
    }

    /** @returns {Promise<void>} */
    run() {
        if (!this.#done) {
            this.#done = this.#sequence().catch((err) => {
                log.error("boot", "sequence failed", { err });
            });
        }
        return this.#done;
    }

    async #sequence() {
        if (this.#reducedMotion) {
            this.#info.reveal();
            this.#removeCover();
            return;
        }
        await delay(CONNECT_DELAY_MS);
        this.#panel.sweep();
        await delay(REVEAL_DELAY_MS);
        this.#info.reveal();
        await this.#openGates();
    }

    #openGates() {
        const cover = this.#cover;
        if (!cover) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            let settled = false;
            let fallback = null;
            const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(fallback);
                this.#removeCover();
                resolve();
            };
            const gate = cover.querySelector(".gate");
            if (gate) {
                gate.addEventListener("transitionend", finish, { once: true });
            }
            fallback = setTimeout(finish, GATE_FALLBACK_MS + (gate ? 0 : -GATE_TRANSITION_MS));
            cover.classList.add("open");
        });
    }

    #removeCover() {
        if (this.#cover) {
            this.#cover.remove();
            this.#cover = null;
        }
    }
}

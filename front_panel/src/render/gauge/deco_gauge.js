import { prefersReducedMotion } from "../../util/device.js";
import { getTheme } from "../../util/theme.js";
import { animate, stopAnimating } from "./animator.js";
import { drawAuxReading, drawNeedle, percentZones } from "./drawing.js";
import { angleFor, drawFace } from "./face.js";

const ANIM_MS = 600;
const SWEEP_UP_MS = 1035;
const SWEEP_DOWN_MS = 1265;
const RESIZE_DEBOUNCE_MS = 100;
const MAX_DPR = 2;

const registry = new Map();
const resizeObserver =
    globalThis.ResizeObserver &&
    new ResizeObserver((entries) => {
        for (const entry of entries) {
            const gauge = registry.get(entry.target);
            if (gauge) {
                gauge.queueResize();
            }
        }
    });

if (globalThis.document && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => registry.forEach((gauge) => gauge.resize()));
}

const DEFAULT_OPTS = Object.freeze({
    label: "",
    unit: "",
    min: 0,
    max: 100,
    zones: null,
    majorTicks: 5,
    minorPerMajor: 4,
    format: (v) => Math.round(v),
    digital: true,
    /** The digital readout turns ruby once the shown value reaches this; null disables it. */
    alertAt: null,
});

/**
 * An Art Deco dial drawn on a canvas: the static face is rendered once per
 * resize to an offscreen layer; only the needle and readout redraw per frame.
 */
export class DecoGauge {
    #container;
    #canvas;
    #ctx;
    #staticLayer;
    #displayValue;
    #anim = null;
    #resizeTimer = null;
    #reducedMotion;
    #auxReading = null;
    #forcedAlert = false;

    constructor(container, opts = {}) {
        this.opts = { ...DEFAULT_OPTS, ...opts };
        if (!this.opts.zones) {
            this.opts.zones = percentZones(this.opts.max);
        }
        this.#reducedMotion = prefersReducedMotion();
        this.#container = container;
        container.classList.add("deco-gauge");
        container.setAttribute("role", "meter");
        container.setAttribute("aria-valuemin", String(this.opts.min));
        container.setAttribute("aria-valuemax", String(this.opts.max));
        if (this.opts.label) {
            container.setAttribute("aria-label", this.opts.label);
        }

        this.#canvas = document.createElement("canvas");
        this.#canvas.className = "deco-gauge-canvas";
        container.appendChild(this.#canvas);
        this.#ctx = this.#canvas.getContext("2d");
        this.#staticLayer = document.createElement("canvas");
        this.#displayValue = this.opts.min;

        registry.set(container, this);
        if (resizeObserver) {
            resizeObserver.observe(container);
        }
        this.resize();
    }

    get maxValue() {
        return this.opts.max;
    }

    get value() {
        return this.#displayValue;
    }

    set(value) {
        const target = this.#clamp(value);
        this.#container.setAttribute("aria-valuenow", String(Math.round(target)));
        if (this.#reducedMotion) {
            this.#displayValue = target;
            this.#render();
            return;
        }
        this.#anim = {
            from: this.#displayValue,
            to: target,
            start: performance.now(),
            duration: ANIM_MS,
        };
        animate(this);
    }

    sweep() {
        if (this.#reducedMotion) {
            return;
        }
        this.#anim = {
            from: this.opts.min,
            to: this.opts.max,
            start: performance.now(),
            duration: SWEEP_UP_MS,
            then: { from: this.opts.max, to: this.opts.min, duration: SWEEP_DOWN_MS },
        };
        animate(this);
    }

    /**
     * Shows a small secondary reading above the hub (e.g. a drive temperature),
     * or clears it with null. Redraws only when the reading changes.
     * @param {{ text: string, alert: boolean } | null} reading
     */
    setAuxReading(reading) {
        const current = this.#auxReading;
        const next = reading ? { text: reading.text, alert: Boolean(reading.alert) } : null;
        if (current?.text === next?.text && current?.alert === next?.alert) {
            return;
        }
        this.#auxReading = next;
        if (!this.#anim) {
            this.#render();
        }
    }

    /**
     * Whether the readout would be ruby when showing `value` (the `alertAt`
     * rule), so a cluster can mirror its members' alerts on the summary.
     * @param {number} value
     */
    isAlertAt(value) {
        return (
            this.opts.alertAt !== null && this.opts.format(this.#clamp(value)) >= this.opts.alertAt
        );
    }

    /**
     * Turns the readout ruby regardless of `alertAt`, e.g. for a summary whose
     * members each have their own threshold.
     * @param {boolean} isAlert
     */
    setForcedAlert(isAlert) {
        if (this.#forcedAlert === isAlert) {
            return;
        }
        this.#forcedAlert = isAlert;
        if (!this.#anim) {
            this.#render();
        }
    }

    setMax(max, { zones, majorTicks, format } = {}) {
        this.opts.max = max;
        this.opts.zones = zones || percentZones(max);
        if (majorTicks) this.opts.majorTicks = majorTicks;
        if (format) this.opts.format = format;
        this.#container.setAttribute("aria-valuemax", String(max));
        this.#displayValue = this.#clamp(this.#displayValue);
        this.#buildStatic();
        this.#render();
    }

    setLabel(label) {
        this.opts.label = label;
        this.#container.setAttribute("aria-label", label);
        this.#buildStatic();
        this.#render();
    }

    resize() {
        const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
        const w = this.#container.clientWidth;
        const h = this.#container.clientHeight;
        if (w === 0 || h === 0) return;
        this.#canvas.width = Math.round(w * dpr);
        this.#canvas.height = Math.round(h * dpr);
        this.#staticLayer.width = this.#canvas.width;
        this.#staticLayer.height = this.#canvas.height;
        this.#buildStatic();
        this.#render();
    }

    queueResize() {
        clearTimeout(this.#resizeTimer);
        this.#resizeTimer = setTimeout(() => this.resize(), RESIZE_DEBOUNCE_MS);
    }

    destroy() {
        clearTimeout(this.#resizeTimer);
        if (resizeObserver) {
            resizeObserver.unobserve(this.#container);
        }
        registry.delete(this.#container);
        stopAnimating(this);
        this.#canvas.remove();
        this.#container.classList.remove("deco-gauge");
        this.#container.removeAttribute("role");
    }

    /** Animator callback. */
    step(now) {
        const anim = this.#anim;
        if (!anim) {
            stopAnimating(this);
            return;
        }
        const p = Math.min(1, (now - anim.start) / anim.duration);
        const eased = 1 - Math.pow(1 - p, 3);
        this.#displayValue = anim.from + (anim.to - anim.from) * eased;
        this.#render();
        if (p >= 1) {
            if (anim.then) {
                this.#anim = { start: now, ...anim.then };
            } else {
                this.#anim = null;
                stopAnimating(this);
            }
        }
    }

    #clamp(value) {
        return Math.min(this.opts.max, Math.max(this.opts.min, value));
    }

    #buildStatic() {
        drawFace(this.#staticLayer, this.opts);
    }

    #render() {
        const theme = getTheme();
        const ctx = this.#ctx;
        const w = this.#canvas.width;
        const h = this.#canvas.height;
        const s = Math.min(w, h);
        if (s === 0) return;
        const cx = w / 2;
        const cy = h / 2;

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(this.#staticLayer, 0, 0);

        if (this.#auxReading) {
            drawAuxReading(ctx, cx, cy, s, this.#auxReading);
        }
        drawNeedle(ctx, cx, cy, s, angleFor(this.opts, this.#displayValue));

        if (this.opts.digital) {
            const shown = this.opts.format(this.#displayValue);
            const isAlert = this.#forcedAlert || this.isAlertAt(this.#displayValue);
            ctx.fillStyle = isAlert ? theme.ruby : theme.cream;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `500 ${Math.max(10, s * 0.075)}px ${theme.fontBody}`;
            const unit = this.opts.unit ? ` ${this.opts.unit}` : "";
            ctx.fillText(`${shown}${unit}`, cx, cy + s * 0.255);
        }
    }
}

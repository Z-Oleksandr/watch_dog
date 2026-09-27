import { prefersReducedMotion } from "../../util/device.js";
import { getTheme } from "../../util/theme.js";
import { animate, stopAnimating } from "./animator.js";
import { brassRingGradient, lacquerFace, percentZones, sunburstEngraving } from "./drawing.js";

const START_ANGLE = 0.75 * Math.PI;
const ANGLE_RANGE = 1.5 * Math.PI;
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

    #angleFor(value) {
        const span = this.opts.max - this.opts.min || 1;
        return START_ANGLE + ((value - this.opts.min) / span) * ANGLE_RANGE;
    }

    #buildStatic() {
        const theme = getTheme();
        const ctx = this.#staticLayer.getContext("2d");
        const w = this.#staticLayer.width;
        const h = this.#staticLayer.height;
        const s = Math.min(w, h);
        const cx = w / 2;
        const cy = h / 2;
        ctx.clearRect(0, 0, w, h);
        if (s === 0) return;

        const bezelR = s * 0.47;
        ctx.fillStyle = brassRingGradient(ctx, cx, cy, bezelR);
        ctx.beginPath();
        ctx.arc(cx, cy, bezelR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = theme.bezelInner;
        ctx.beginPath();
        ctx.arc(cx, cy, bezelR - s * 0.018, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = theme.brassDark;
        ctx.lineWidth = Math.max(1, s * 0.004);
        ctx.beginPath();
        ctx.arc(cx, cy, bezelR - s * 0.03, 0, Math.PI * 2);
        ctx.stroke();

        lacquerFace(ctx, cx, cy, s * 0.42);
        sunburstEngraving(ctx, cx, cy, s * 0.42);

        for (const zone of this.opts.zones) {
            ctx.strokeStyle = zone.color;
            ctx.lineWidth = s * 0.022;
            ctx.beginPath();
            ctx.arc(cx, cy, s * 0.365, this.#angleFor(zone.from), this.#angleFor(zone.to));
            ctx.stroke();
        }

        const majors = Math.max(2, this.opts.majorTicks);
        const minors = Math.max(0, this.opts.minorPerMajor);
        const totalTicks = (majors - 1) * (minors + 1);
        for (let i = 0; i <= totalTicks; i++) {
            const angle = START_ANGLE + (i / totalTicks) * ANGLE_RANGE;
            const isMajor = i % (minors + 1) === 0;
            const inner = isMajor ? s * 0.3 : s * 0.325;
            ctx.strokeStyle = isMajor ? theme.brass : theme.brassDark;
            ctx.lineWidth = isMajor ? Math.max(1.5, s * 0.008) : Math.max(1, s * 0.004);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
            ctx.lineTo(cx + Math.cos(angle) * s * 0.35, cy + Math.sin(angle) * s * 0.35);
            ctx.stroke();
        }

        const span = this.opts.max - this.opts.min;
        ctx.fillStyle = theme.cream;
        ctx.font = `${Math.max(9, s * 0.075)}px ${theme.fontBody}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let i = 0; i < majors; i++) {
            const value = this.opts.min + (i / (majors - 1)) * span;
            const angle = START_ANGLE + (i / (majors - 1)) * ANGLE_RANGE;
            const nr = s * 0.235;
            ctx.fillText(
                String(this.opts.format(value)),
                cx + Math.cos(angle) * nr,
                cy + Math.sin(angle) * nr
            );
        }

        if (this.opts.label) {
            const labelY = cy + s * 0.345;
            ctx.fillStyle = theme.brass;
            ctx.font = `600 ${Math.max(9, s * 0.062)}px ${theme.fontBody}`;
            const text = this.opts.label.toUpperCase().split("").join("  ");
            ctx.fillText(text, cx, labelY);
            const tw = ctx.measureText(text).width / 2 + s * 0.03;
            ctx.strokeStyle = theme.brassDark;
            ctx.lineWidth = Math.max(1, s * 0.004);
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(cx + side * tw, labelY);
                ctx.lineTo(cx + side * (tw + s * 0.05), labelY);
                ctx.stroke();
            }
        }
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

        const angle = this.#angleFor(this.#displayValue);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.shadowColor = theme.glow;
        ctx.shadowBlur = s * 0.03;
        const needle = ctx.createLinearGradient(0, 0, s * 0.31, 0);
        needle.addColorStop(0, theme.brassLight);
        needle.addColorStop(1, theme.glow);
        ctx.fillStyle = needle;
        ctx.beginPath();
        ctx.moveTo(-s * 0.07, -s * 0.014);
        ctx.lineTo(s * 0.31, 0);
        ctx.lineTo(-s * 0.07, s * 0.014);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = brassRingGradient(ctx, cx, cy, s * 0.045);
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.045, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = theme.face;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.022, 0, Math.PI * 2);
        ctx.fill();

        if (this.opts.digital) {
            ctx.fillStyle = theme.cream;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `500 ${Math.max(10, s * 0.075)}px ${theme.fontBody}`;
            const unit = this.opts.unit ? ` ${this.opts.unit}` : "";
            ctx.fillText(`${this.opts.format(this.#displayValue)}${unit}`, cx, cy + s * 0.255);
        }
    }
}

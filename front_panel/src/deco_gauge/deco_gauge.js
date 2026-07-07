import { DECO, brassRingGradient, lacquerFace, sunburstEngraving, percentZones } from "./theme";

const START_ANGLE = 0.75 * Math.PI;
const ANGLE_RANGE = 1.5 * Math.PI;
const ANIM_MS = 600;

const active_gauges = new Set();
let raf_id = null;

function animator_tick(now) {
    for (const gauge of active_gauges) {
        gauge._step(now);
    }
    raf_id = active_gauges.size > 0 ? requestAnimationFrame(animator_tick) : null;
}

function animate(gauge) {
    active_gauges.add(gauge);
    if (raf_id === null) {
        raf_id = requestAnimationFrame(animator_tick);
    }
}

const gauge_registry = new Map();
const resize_observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
        const gauge = gauge_registry.get(entry.target);
        if (gauge) {
            gauge._queueResize();
        }
    }
});

if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
        gauge_registry.forEach((gauge) => gauge.resize());
    });
}

export class DecoGauge {
    constructor(container, opts = {}) {
        this.opts = Object.assign(
            {
                label: "",
                unit: "",
                min: 0,
                max: 100,
                zones: null,
                majorTicks: 5,
                minorPerMajor: 4,
                format: (v) => Math.round(v),
                digital: true,
            },
            opts
        );
        if (!this.opts.zones) {
            this.opts.zones = percentZones(this.opts.max);
        }

        this.container = container;
        container.classList.add("deco-gauge");

        this.canvas = document.createElement("canvas");
        this.canvas.className = "deco-gauge-canvas";
        container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext("2d");
        this.static_layer = document.createElement("canvas");

        this.display_value = this.opts.min;
        this.anim = null;
        this.resize_timer = null;

        gauge_registry.set(container, this);
        resize_observer.observe(container);
        this.resize();
    }

    get maxValue() {
        return this.opts.max;
    }

    set(value) {
        const target = this._clamp(value);
        this.anim = {
            from: this.display_value,
            to: target,
            start: performance.now(),
            duration: ANIM_MS,
        };
        animate(this);
    }

    sweep() {
        this.anim = {
            from: this.opts.min,
            to: this.opts.max,
            start: performance.now(),
            duration: 1035,
            then: {
                from: this.opts.max,
                to: this.opts.min,
                duration: 1265,
            },
        };
        animate(this);
    }

    setMax(max, { zones, majorTicks, format } = {}) {
        this.opts.max = max;
        this.opts.zones = zones || percentZones(max);
        if (majorTicks) this.opts.majorTicks = majorTicks;
        if (format) this.opts.format = format;
        this.display_value = this._clamp(this.display_value);
        this._buildStatic();
        this._render();
    }

    setLabel(label) {
        this.opts.label = label;
        this._buildStatic();
        this._render();
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (w === 0 || h === 0) return;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.static_layer.width = this.canvas.width;
        this.static_layer.height = this.canvas.height;
        this.dpr = dpr;
        this._buildStatic();
        this._render();
    }

    destroy() {
        resize_observer.unobserve(this.container);
        gauge_registry.delete(this.container);
        active_gauges.delete(this);
        this.canvas.remove();
        this.container.classList.remove("deco-gauge");
    }

    _clamp(value) {
        return Math.min(this.opts.max, Math.max(this.opts.min, value));
    }

    _queueResize() {
        clearTimeout(this.resize_timer);
        this.resize_timer = setTimeout(() => this.resize(), 100);
    }

    _step(now) {
        if (!this.anim) {
            active_gauges.delete(this);
            return;
        }
        const p = Math.min(1, (now - this.anim.start) / this.anim.duration);
        const eased = 1 - Math.pow(1 - p, 3);
        this.display_value = this.anim.from + (this.anim.to - this.anim.from) * eased;
        this._render();
        if (p >= 1) {
            if (this.anim.then) {
                this.anim = Object.assign({ start: now }, this.anim.then);
            } else {
                this.anim = null;
                active_gauges.delete(this);
            }
        }
    }

    _angleFor(value) {
        const span = this.opts.max - this.opts.min || 1;
        return START_ANGLE + ((value - this.opts.min) / span) * ANGLE_RANGE;
    }

    _buildStatic() {
        const ctx = this.static_layer.getContext("2d");
        const w = this.static_layer.width;
        const h = this.static_layer.height;
        const s = Math.min(w, h);
        const cx = w / 2;
        const cy = h / 2;
        ctx.clearRect(0, 0, w, h);
        if (s === 0) return;

        const bezel_r = s * 0.47;
        ctx.fillStyle = brassRingGradient(ctx, cx, cy, bezel_r);
        ctx.beginPath();
        ctx.arc(cx, cy, bezel_r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#0a0a0c";
        ctx.beginPath();
        ctx.arc(cx, cy, bezel_r - s * 0.018, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = DECO.brassDark;
        ctx.lineWidth = Math.max(1, s * 0.004);
        ctx.beginPath();
        ctx.arc(cx, cy, bezel_r - s * 0.03, 0, Math.PI * 2);
        ctx.stroke();

        lacquerFace(ctx, cx, cy, s * 0.42);
        sunburstEngraving(ctx, cx, cy, s * 0.42);

        for (const zone of this.opts.zones) {
            ctx.strokeStyle = zone.color;
            ctx.lineWidth = s * 0.022;
            ctx.beginPath();
            ctx.arc(cx, cy, s * 0.365, this._angleFor(zone.from), this._angleFor(zone.to));
            ctx.stroke();
        }

        const majors = Math.max(2, this.opts.majorTicks);
        const minors = Math.max(0, this.opts.minorPerMajor);
        const total_ticks = (majors - 1) * (minors + 1);
        for (let i = 0; i <= total_ticks; i++) {
            const angle = START_ANGLE + (i / total_ticks) * ANGLE_RANGE;
            const is_major = i % (minors + 1) === 0;
            const inner = is_major ? s * 0.3 : s * 0.325;
            ctx.strokeStyle = is_major ? DECO.brass : DECO.brassDark;
            ctx.lineWidth = is_major ? Math.max(1.5, s * 0.008) : Math.max(1, s * 0.004);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
            ctx.lineTo(cx + Math.cos(angle) * s * 0.35, cy + Math.sin(angle) * s * 0.35);
            ctx.stroke();
        }

        const span = this.opts.max - this.opts.min;
        ctx.fillStyle = DECO.cream;
        ctx.font = `${Math.max(9, s * 0.075)}px ${DECO.numeralFont}`;
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
            const label_y = cy + s * 0.345;
            ctx.fillStyle = DECO.brass;
            ctx.font = `600 ${Math.max(9, s * 0.062)}px ${DECO.numeralFont}`;
            const text = this.opts.label.toUpperCase().split("").join("  ");
            ctx.fillText(text, cx, label_y);
            const tw = ctx.measureText(text).width / 2 + s * 0.03;
            ctx.strokeStyle = DECO.brassDark;
            ctx.lineWidth = Math.max(1, s * 0.004);
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(cx + side * tw, label_y);
                ctx.lineTo(cx + side * (tw + s * 0.05), label_y);
                ctx.stroke();
            }
        }
    }

    _render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const s = Math.min(w, h);
        if (s === 0) return;
        const cx = w / 2;
        const cy = h / 2;

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(this.static_layer, 0, 0);

        const angle = this._angleFor(this.display_value);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.shadowColor = DECO.glow;
        ctx.shadowBlur = s * 0.03;
        const needle = ctx.createLinearGradient(0, 0, s * 0.31, 0);
        needle.addColorStop(0, DECO.brassLight);
        needle.addColorStop(1, DECO.glow);
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
        ctx.fillStyle = DECO.face;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.022, 0, Math.PI * 2);
        ctx.fill();

        if (this.opts.digital) {
            ctx.fillStyle = DECO.cream;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `500 ${Math.max(10, s * 0.075)}px ${DECO.numeralFont}`;
            const text = `${this.opts.format(this.display_value)}${this.opts.unit ? " " + this.opts.unit : ""}`;
            ctx.fillText(text, cx, cy + s * 0.255);
        }
    }
}

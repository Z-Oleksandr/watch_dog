import { getTheme } from "../../util/theme.js";
import { brassRingGradient, lacquerFace, sunburstEngraving } from "./drawing.js";

/** The dial sweeps 270°, starting at the lower left. */
const START_ANGLE = 0.75 * Math.PI;
const ANGLE_RANGE = 1.5 * Math.PI;

/**
 * Tracking between the letters of a dial label: two hair spaces (U+200A).
 * Written as escapes because ordinary spaces here double the label's width.
 */
const LABEL_LETTER_GAP = "\u200A\u200A";

/**
 * The engraved form of a dial label: upper case, letters lightly tracked.
 * @param {string} label
 */
export function labelText(label) {
    return label.toUpperCase().split("").join(LABEL_LETTER_GAP);
}

/**
 * Canvas angle of `value` on a dial with the given range.
 * @param {{ min: number, max: number }} opts
 * @param {number} value
 */
export function angleFor(opts, value) {
    const span = opts.max - opts.min || 1;
    return START_ANGLE + ((value - opts.min) / span) * ANGLE_RANGE;
}

/**
 * Renders the static dial (bezel, face, zones, ticks, numerals, label) onto
 * `layer`. Called once per resize or option change, never per frame.
 * @param {HTMLCanvasElement} layer
 * @param {object} opts Gauge options (see DecoGauge).
 */
export function drawFace(layer, opts) {
    const theme = getTheme();
    const ctx = layer.getContext("2d");
    const w = layer.width;
    const h = layer.height;
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

    for (const zone of opts.zones) {
        ctx.strokeStyle = zone.color;
        ctx.lineWidth = s * 0.022;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.365, angleFor(opts, zone.from), angleFor(opts, zone.to));
        ctx.stroke();
    }

    const majors = Math.max(2, opts.majorTicks);
    const minors = Math.max(0, opts.minorPerMajor);
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

    const span = opts.max - opts.min;
    ctx.fillStyle = theme.cream;
    ctx.font = `${Math.max(9, s * 0.075)}px ${theme.fontBody}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < majors; i++) {
        const value = opts.min + (i / (majors - 1)) * span;
        const angle = START_ANGLE + (i / (majors - 1)) * ANGLE_RANGE;
        const nr = s * 0.235;
        ctx.fillText(
            String(opts.format(value)),
            cx + Math.cos(angle) * nr,
            cy + Math.sin(angle) * nr
        );
    }

    if (opts.label) {
        const labelY = cy + s * 0.345;
        ctx.fillStyle = theme.brass;
        ctx.font = `600 ${Math.max(9, s * 0.062)}px ${theme.fontBody}`;
        const text = labelText(opts.label);
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

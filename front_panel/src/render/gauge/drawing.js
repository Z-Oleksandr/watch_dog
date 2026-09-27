import { getTheme } from "../../util/theme.js";

/** Green / amber / red bands at 60 % and 80 % of the range. */
export function percentZones(max) {
    const theme = getTheme();
    return [
        { from: 0, to: 0.6 * max, color: theme.emerald },
        { from: 0.6 * max, to: 0.8 * max, color: theme.amber },
        { from: 0.8 * max, to: max, color: theme.ruby },
    ];
}

export function brassRingGradient(ctx, cx, cy, r) {
    const theme = getTheme();
    const gradient = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    gradient.addColorStop(0, theme.brassLight);
    gradient.addColorStop(0.35, theme.brass);
    gradient.addColorStop(0.6, theme.brassDark);
    gradient.addColorStop(0.85, theme.brass);
    gradient.addColorStop(1, theme.brassLight);
    return gradient;
}

export function lacquerFace(ctx, cx, cy, r) {
    const theme = getTheme();
    const gradient = ctx.createRadialGradient(cx, cy - r * 0.25, r * 0.1, cx, cy, r);
    gradient.addColorStop(0, theme.faceCenter);
    gradient.addColorStop(0.65, theme.face);
    gradient.addColorStop(1, theme.faceEdge);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
}

export function sunburstEngraving(ctx, cx, cy, r, rays = 36, alpha = 0.05) {
    const theme = getTheme();
    ctx.save();
    ctx.strokeStyle = theme.brassLight;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    for (let i = 0; i < rays; i++) {
        const angle = (i / rays) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * r * 0.12, cy + Math.sin(angle) * r * 0.12);
        ctx.lineTo(cx + Math.cos(angle) * r * 0.92, cy + Math.sin(angle) * r * 0.92);
        ctx.stroke();
    }
    ctx.restore();
}

/**
 * The glowing needle at `angle` and the brass hub it pivots on. `s` is the
 * gauge's square size in backing pixels.
 */
export function drawNeedle(ctx, cx, cy, s, angle) {
    const theme = getTheme();
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
}

/**
 * Offset of the auxiliary reading above the centre, midway between the hub
 * (0.045) and the lower edge of the top numeral (0.235 less half its 0.075 font).
 */
const AUX_READING_OFFSET = 0.12;
const AUX_READING_FONT = 0.06;
const MIN_AUX_FONT_PX = 9;

/**
 * A small secondary reading between the hub and the top numerals, drawn
 * under the needle. Cream normally, ruby when `alert` is set.
 * @param {{ text: string, alert: boolean }} reading
 */
export function drawAuxReading(ctx, cx, cy, s, reading) {
    const theme = getTheme();
    ctx.fillStyle = reading.alert ? theme.ruby : theme.cream;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `500 ${Math.max(MIN_AUX_FONT_PX, s * AUX_READING_FONT)}px ${theme.fontBody}`;
    ctx.fillText(reading.text, cx, cy - s * AUX_READING_OFFSET);
}

/** Background texture for the control panel scene. */
export function drawSunburstTexture(size = 512) {
    const theme = getTheme();
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = theme.face;
    ctx.fillRect(0, 0, size, size);
    const cx = size / 2;
    const cy = size * 0.95;
    const rays = 28;
    const [r, g, b] = hexToRgb(theme.brass);
    for (let i = 0; i < rays; i++) {
        const angle = Math.PI + (i / (rays - 1)) * Math.PI;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        const gradient = ctx.createLinearGradient(0, 0, size, 0);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.16)`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(size, -size * 0.02);
        ctx.lineTo(size, size * 0.02);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    return canvas;
}

export function hexToRgb(hex) {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) {
        return [201, 162, 39];
    }
    const value = parseInt(match[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

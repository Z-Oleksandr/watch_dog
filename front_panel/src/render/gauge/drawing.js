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

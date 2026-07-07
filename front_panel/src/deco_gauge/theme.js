export const DECO = {
    lacquer: "#0d0d10",
    charcoal: "#1a1a1e",
    face: "#101014",
    faceCenter: "#1c1b20",
    brass: "#c9a227",
    brassLight: "#e8c96a",
    brassDark: "#8a6d1d",
    cream: "#f2e8c9",
    creamDim: "#b8ad8c",
    emerald: "#1f9e6e",
    amber: "#e0a020",
    ruby: "#c03546",
    glow: "#ffb84d",
    numeralFont: "'Josefin Sans', sans-serif",
    displayFont: "'Limelight', 'Josefin Sans', sans-serif",
};

export function percentZones(max) {
    return [
        { from: 0, to: 0.6 * max, color: DECO.emerald },
        { from: 0.6 * max, to: 0.8 * max, color: DECO.amber },
        { from: 0.8 * max, to: max, color: DECO.ruby },
    ];
}

export function brassRingGradient(ctx, cx, cy, r) {
    const gradient = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    gradient.addColorStop(0, DECO.brassLight);
    gradient.addColorStop(0.35, DECO.brass);
    gradient.addColorStop(0.6, DECO.brassDark);
    gradient.addColorStop(0.85, DECO.brass);
    gradient.addColorStop(1, DECO.brassLight);
    return gradient;
}

export function lacquerFace(ctx, cx, cy, r) {
    const gradient = ctx.createRadialGradient(cx, cy - r * 0.25, r * 0.1, cx, cy, r);
    gradient.addColorStop(0, DECO.faceCenter);
    gradient.addColorStop(0.65, DECO.face);
    gradient.addColorStop(1, "#08080a");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
}

export function sunburstEngraving(ctx, cx, cy, r, rays = 36, alpha = 0.05) {
    ctx.save();
    ctx.strokeStyle = DECO.brassLight;
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

export function drawSunburstTexture(size = 512) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = DECO.face;
    ctx.fillRect(0, 0, size, size);
    const cx = size / 2;
    const cy = size * 0.95;
    const rays = 28;
    for (let i = 0; i < rays; i++) {
        const angle = Math.PI + (i / (rays - 1)) * Math.PI;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        const gradient = ctx.createLinearGradient(0, 0, size, 0);
        gradient.addColorStop(0, "rgba(201, 162, 39, 0.16)");
        gradient.addColorStop(1, "rgba(201, 162, 39, 0)");
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

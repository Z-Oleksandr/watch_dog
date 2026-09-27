/**
 * Design tokens for canvas, WebGL and chart rendering, read from the CSS
 * custom properties declared on `:root` in `public/css/deco.css`. CSS is the
 * single source of truth; the fallbacks below only exist so modules can render
 * in environments without a stylesheet (tests).
 */

const TOKENS = Object.freeze({
    lacquer: ["--lacquer", "#0d0d10"],
    lacquerWarm: ["--lacquer-warm", "#14120c"],
    charcoal: ["--charcoal", "#1a1a1e"],
    face: ["--face", "#101014"],
    faceCenter: ["--face-center", "#1c1b20"],
    faceEdge: ["--face-edge", "#08080a"],
    bezelInner: ["--bezel-inner", "#0a0a0c"],
    brass: ["--brass", "#c9a227"],
    brassLight: ["--brass-light", "#e8c96a"],
    brassDark: ["--brass-dark", "#8a6d1d"],
    cream: ["--cream", "#f2e8c9"],
    creamDim: ["--cream-dim", "#b8ad8c"],
    emerald: ["--emerald", "#1f9e6e"],
    amber: ["--amber", "#e0a020"],
    ruby: ["--ruby", "#c03546"],
    steel: ["--steel", "#5b8cbe"],
    glow: ["--glow", "#ffb84d"],
    grid: ["--grid", "#2a2a2e"],
    fontBody: ["--font-body", "'Josefin Sans', sans-serif"],
    fontDisplay: ["--font-display", "'Limelight', 'Josefin Sans', sans-serif"],
});

let cached = null;

function readTokens() {
    const root = globalThis.document && document.documentElement;
    const styles = root && globalThis.getComputedStyle ? getComputedStyle(root) : null;
    const theme = {};
    for (const [name, [property, fallback]] of Object.entries(TOKENS)) {
        const value = styles ? styles.getPropertyValue(property).trim() : "";
        theme[name] = value || fallback;
    }
    return Object.freeze(theme);
}

/** Returns the resolved token set; computed once and cached. */
export function getTheme() {
    if (!cached) {
        cached = readTokens();
    }
    return cached;
}

/** Test hook: forget the cached tokens so a changed stylesheet is re-read. */
export function resetThemeCache() {
    cached = null;
}

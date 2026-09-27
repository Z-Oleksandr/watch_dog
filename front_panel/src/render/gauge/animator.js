import { isDocumentHidden } from "../../util/device.js";

/**
 * One requestAnimationFrame loop shared by every animating gauge. It runs
 * only while at least one gauge has an animation in flight and stops while
 * the tab is hidden, resuming when it becomes visible again.
 */
const active = new Set();
let rafId = null;
let listening = false;

function tick(now) {
    rafId = null;
    for (const gauge of active) {
        gauge.step(now);
    }
    schedule();
}

function schedule() {
    if (rafId !== null || active.size === 0 || isDocumentHidden()) {
        return;
    }
    rafId = requestAnimationFrame(tick);
}

function onVisibilityChange() {
    if (isDocumentHidden()) {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    } else {
        schedule();
    }
}

/** @param {{ step(now: number): void }} gauge */
export function animate(gauge) {
    if (!listening && globalThis.document) {
        document.addEventListener("visibilitychange", onVisibilityChange);
        listening = true;
    }
    active.add(gauge);
    schedule();
}

export function stopAnimating(gauge) {
    active.delete(gauge);
}

export function activeCount() {
    return active.size;
}

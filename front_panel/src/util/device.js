const MOBILE_UA = /Mobi|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

export function isMobile() {
    return MOBILE_UA.test(globalThis.navigator ? navigator.userAgent : "");
}

export function prefersReducedMotion() {
    return Boolean(globalThis.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
}

export function isDocumentHidden() {
    return Boolean(globalThis.document && document.visibilityState === "hidden");
}

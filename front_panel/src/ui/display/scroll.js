/**
 * Wheel and touch scrolling over the teleprinter. Returns a disposer.
 * @param {HTMLElement} root
 * @param {import("./display.js").Display} display
 */
export function attachDisplayScroll(root, display) {
    const abort = new AbortController();
    const { signal } = abort;
    const lineHeight = parseInt(display.fontSize, 10) * 2;
    let wheelOffset = 0;
    let touchStartY = 0;
    let touchOffset = 0;

    function scrollLines(lines) {
        for (let i = 0; i < Math.abs(lines); i++) {
            if (lines < 0) {
                display.scrollUp();
            } else {
                display.scrollDown();
            }
        }
    }

    root.addEventListener(
        "wheel",
        (event) => {
            event.preventDefault();
            wheelOffset += event.deltaY;
            const lines = Math.trunc(wheelOffset / lineHeight);
            if (lines !== 0) {
                scrollLines(lines);
                wheelOffset -= lines * lineHeight;
            }
        },
        { signal, passive: false }
    );

    root.addEventListener(
        "touchstart",
        (event) => {
            touchStartY = event.touches[0].clientY;
            touchOffset = 0;
        },
        { signal, passive: true }
    );

    root.addEventListener(
        "touchmove",
        (event) => {
            event.preventDefault();
            const y = event.touches[0].clientY;
            touchOffset += touchStartY - y;
            touchStartY = y;
            const lines = Math.trunc(touchOffset / lineHeight);
            if (lines !== 0) {
                scrollLines(lines);
                touchOffset -= lines * lineHeight;
            }
        },
        { signal, passive: false }
    );

    return () => abort.abort();
}

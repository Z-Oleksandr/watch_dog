import { log } from "../../util/logger.js";
import { LineBuffer } from "./buffer.js";

const MAX_LINE_CHARS = 80;
const SPLIT_AT = 50;
const CHAR_INTERVAL_MS = 12;
const LINE_HEIGHT_FACTOR = 1.65;
const FONT_PX_DESKTOP = 14;
const FONT_PX_MOBILE = 9;
const FALLBACK_ROWS = 8;
const MAX_QUEUE = 100;

/**
 * The teleprinter: a fixed grid of rows that types lines out one character
 * at a time, with a scrollable backlog and a "pending choice" row that an
 * operator edits with the +/- buttons before confirming.
 *
 * Writes are serialized through one queue so a burst of lines never
 * interleaves characters. Reduced-motion users get lines set at once.
 */
export class Display {
    #rows = [];
    #rowCount;
    #current = 0;
    #buffer;
    #queue = [];
    #writing = false;
    #pendingRow = -1;
    #typingTimer = null;
    #reducedMotion;
    #fontSize;

    /**
     * @param {HTMLElement} root
     * @param {{ isMobile?: boolean, reducedMotion?: boolean }} [options]
     */
    constructor(root, { isMobile = false, reducedMotion = false } = {}) {
        this.#reducedMotion = reducedMotion;
        const fontPx = isMobile ? FONT_PX_MOBILE : FONT_PX_DESKTOP;
        this.#fontSize = `${fontPx}px`;
        const height = root.clientHeight;
        this.#rowCount =
            height > 0
                ? Math.max(1, Math.floor(height / (LINE_HEIGHT_FACTOR * fontPx)))
                : FALLBACK_ROWS;
        this.#buffer = new LineBuffer(this.#rowCount);

        root.setAttribute("role", "log");
        root.setAttribute("aria-live", "polite");
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < this.#rowCount; i++) {
            const row = document.createElement("p");
            row.className = "display2Row";
            row.style.fontSize = this.#fontSize;
            fragment.appendChild(row);
            this.#rows.push(row);
        }
        root.appendChild(fragment);
    }

    get rowCount() {
        return this.#rowCount;
    }

    get fontSize() {
        return this.#fontSize;
    }

    get isPending() {
        return this.#pendingRow !== -1;
    }

    get queueLength() {
        return this.#queue.length;
    }

    /** Types a line at the bottom of the display, queued behind earlier writes. */
    writeLine(text) {
        const line = String(text);
        if (line.length > MAX_LINE_CHARS) {
            this.writeLine(line.slice(0, SPLIT_AT));
            this.writeLine(line.slice(SPLIT_AT));
            return;
        }
        this.#enqueue({ kind: "line", text: line });
    }

    /**
     * Shows or updates an editable row. `final` commits the row so the next
     * write lands below it.
     */
    pendingChoice(text, final = false) {
        const line = String(text);
        if (line.length > MAX_LINE_CHARS) {
            log.warn("display", "pending choice text too long, ignored", { length: line.length });
            return;
        }
        if (this.isPending) {
            this.#rows[this.#pendingRow].textContent = line;
            if (final) {
                this.#pendingRow = -1;
                this.#current += 1;
                this.#writing = false;
                this.#drain();
            }
            return;
        }
        this.#enqueue({ kind: "pending", text: line, final });
    }

    scrollUp() {
        const rows = this.#buffer.oneUp();
        if (rows) {
            this.#render(rows);
        }
    }

    scrollDown() {
        const rows = this.#buffer.oneDown();
        if (rows) {
            this.#render(rows);
        }
    }

    clear() {
        this.#cancelTyping();
        for (const row of this.#rows) {
            row.textContent = "";
        }
        this.#current = 0;
        this.#pendingRow = -1;
        this.#writing = false;
        this.#queue = [];
        this.#buffer.empty();
    }

    destroy() {
        this.clear();
        for (const row of this.#rows) {
            row.remove();
        }
    }

    #enqueue(op) {
        if (this.#queue.length >= MAX_QUEUE) {
            this.#queue.shift();
            log.warn("display", "write queue full, dropped oldest line");
        }
        this.#queue.push(op);
        this.#drain();
    }

    #drain() {
        if (this.#writing || this.isPending) {
            return;
        }
        const op = this.#queue.shift();
        if (!op) {
            return;
        }
        this.#writing = true;
        const tail = this.#buffer.backToTail();
        if (tail) {
            this.#render(tail);
        }
        if (op.kind === "line") {
            this.#buffer.addLine(op.text);
            const row = this.#rowForNextLine();
            this.#type(op.text, row, () => {
                this.#writing = false;
                this.#drain();
            });
            return;
        }
        const row = this.#rowForNextLine();
        row.textContent = op.text;
        if (op.final) {
            this.#current += 1;
            this.#writing = false;
            this.#drain();
        } else {
            this.#pendingRow = this.#rows.indexOf(row);
        }
    }

    /** Returns the row a new line goes into, shifting the grid up when full. */
    #rowForNextLine() {
        if (this.#current < this.#rowCount) {
            return this.#rows[this.#current];
        }
        for (let i = 0; i < this.#rowCount - 1; i++) {
            this.#rows[i].textContent = this.#rows[i + 1].textContent;
        }
        this.#current = this.#rowCount - 1;
        return this.#rows[this.#rowCount - 1];
    }

    /** Types `text` into `row`, calling `done` synchronously once complete. */
    #type(text, row, done) {
        this.#current += 1;
        if (this.#reducedMotion || text.length === 0) {
            row.textContent = text;
            done();
            return;
        }
        let i = 0;
        row.textContent = "";
        this.#typingTimer = setInterval(() => {
            row.textContent += text[i];
            i += 1;
            if (i >= text.length) {
                this.#cancelTyping();
                done();
            }
        }, CHAR_INTERVAL_MS);
    }

    #cancelTyping() {
        if (this.#typingTimer !== null) {
            clearInterval(this.#typingTimer);
            this.#typingTimer = null;
        }
    }

    #render(lines) {
        for (let i = 0; i < this.#rowCount; i++) {
            this.#rows[i].textContent = lines[i] ?? "";
        }
    }
}

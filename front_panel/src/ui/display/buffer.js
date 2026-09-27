/** Maximum lines retained for scrolling back through the teleprinter. */
export const BUFFER_LIMIT = 42;

/**
 * Scrollback for the teleprinter. Holds at most BUFFER_LIMIT lines and a
 * window of `rows` visible lines over them.
 */
export class LineBuffer {
    #lines = [];
    #rows;
    #start = 0;
    #end = 0;
    #scrolling = false;

    /** @param {number} rows  Visible row count of the display. */
    constructor(rows) {
        this.#rows = Math.max(1, rows);
    }

    get length() {
        return this.#lines.length;
    }

    get isScrolling() {
        return this.#scrolling;
    }

    addLine(text) {
        if (this.#lines.length >= BUFFER_LIMIT) {
            this.#lines.splice(0, this.#lines.length - BUFFER_LIMIT + 1);
            this.#lines.push(text);
            return;
        }
        this.#lines.push(text);
        if (this.#end - this.#start < this.#rows) {
            this.#end += 1;
        } else {
            this.#start += 1;
            this.#end += 1;
        }
    }

    /** @returns {string[] | null} rows to render, or null when already at the top */
    oneUp() {
        if (this.#start === 0) {
            return null;
        }
        this.#start -= 1;
        this.#end -= 1;
        this.#scrolling = true;
        return this.#window();
    }

    /** @returns {string[] | null} rows to render, or null when already at the bottom */
    oneDown() {
        if (this.#end >= this.#lines.length) {
            this.#scrolling = false;
            return null;
        }
        this.#start += 1;
        this.#end += 1;
        if (this.#end === this.#lines.length) {
            this.#scrolling = false;
        }
        return this.#window();
    }

    /**
     * Snaps back to the live tail after scrolling. Returns the rows to render,
     * or null when the view was not scrolled.
     */
    backToTail() {
        if (!this.#scrolling) {
            return null;
        }
        this.#scrolling = false;
        this.#end = this.#lines.length;
        this.#start = Math.max(0, this.#end - this.#rows);
        return this.#window();
    }

    empty() {
        this.#lines = [];
        this.#start = 0;
        this.#end = 0;
        this.#scrolling = false;
    }

    #window() {
        const rows = [];
        for (let i = 0; i < this.#rows; i++) {
            rows.push(this.#lines[this.#start + i] ?? "");
        }
        return rows;
    }
}

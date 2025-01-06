import { isMobile } from "../script";
import { Buffer } from "./buffer";

const displayContainer = document.getElementsByClassName("display_2")[0];
const displayHeight = displayContainer.clientHeight;

export class Display2 {
    constructor(display) {
        this.container = display;
        this.current = 0;
        this.initialSetupState = true;
        this.fontSize;
        this.row_count;
        if (!isMobile()) {
            this.fontSize = "14px";
            console.log("Lines: " + Math.floor(displayHeight / (1.65 * 14)));
            this.row_count = Math.floor(displayHeight / (1.65 * 14));
        } else {
            this.fontSize = "9px";
            this.row_count = Math.floor(displayHeight / (1.65 * 9));
        }
        for (let i = 0; i < this.row_count; i++) {
            this[`row${i}`] = this.create_p(display);
        }
        this.init_message();
        this.terminalWriting = false;
        this.terminalPending = false;
        this.textQueue = [];
        this.buffer = new Buffer(this);
        this.activeRecursiveCalls = 0;
        this.MAX_RECURSIVE_CALLS = 50;
    }

    create_p(display) {
        const row = document.createElement("p");
        row.classList.add("display2Row");
        row.style.fontSize = this.fontSize;
        display.appendChild(row);
        return row;
    }

    init_message() {
        setTimeout(() => {
            this.initialSetupState = false;
            this.write_line("Display 2 initialized.");
        }, 5001);
    }

    loading() {
        for (let i = 0; i < 77; i++) {
            setTimeout(() => {
                this.row0.textContent = `loading [${"#".repeat(i)}]`;
            }, (5000 / 77) * i);
        }
    }

    render(lines) {
        // Clear terminal without resetting current
        for (let i = 0; i < this.row_count; i++) {
            this[`row${i}`].textContent = "";
        }

        // Render
        if (lines.length <= this.row_count) {
            for (let i = 0; i < lines.length; i++) {
                this[`row${i}`].textContent = lines[i];
            }
        }
    }

    write_line(text) {
        if (this.activeRecursiveCalls >= this.MAX_RECURSIVE_CALLS) {
            console.error(
                "Max recursion depth reached in display 2 write_line!"
            );
            console.log("Clear D2 to reset.");
            return;
        }
        if (text.length <= 80) {
            const atBusinessEnd = this.buffer.backToBusiness();
            if (atBusinessEnd != -1) {
                this.render(atBusinessEnd);
            }
            this.buffer.addLine(text);
            if (this.current < this.row_count) {
                const currentRow = this[`row${this.current}`];
                this.terminal_animation(text, currentRow);
            } else {
                // Shift all rows up one, ignore last one and add new one
                for (let i = 0; i < this.row_count - 1; i++) {
                    this[`row${i}`].textContent =
                        this[`row${i + 1}`].textContent;
                }

                const currentRow = this[`row${this.row_count - 1}`];
                this.terminal_animation(text, currentRow);
            }
            this.activeRecursiveCalls--;
        } else {
            this.activeRecursiveCalls++;
            this.write_line(text.slice(0, 40));
            setTimeout(() => {
                this.activeRecursiveCalls++;
                this.write_line(text.slice(40));
            }, 500);
        }
    }

    scrollUp() {
        const toDisplay = this.buffer.oneUp();
        if (toDisplay != -1) {
            this.render(toDisplay);
        }
    }

    scrollDown() {
        const toDisplay = this.buffer.oneDown();
        if (toDisplay != -1) {
            this.render(toDisplay);
        }
    }

    pending_choice(text, isFinalUpdate) {
        if (text.length > 80) {
            console.warn("Text too long for pending_choice!");
            return;
        }

        const rowIndex =
            this.current < this.row_count ? this.current : this.row_count - 1;
        const row = this[`row${rowIndex}`];

        if (!this.terminalWriting) {
            row.textContent = text;
            this.terminalPending = !isFinalUpdate;
            this.terminalWriting = true;
        } else if (this.terminalPending) {
            row.textContent = text;
            if (isFinalUpdate) {
                this.terminalPending = false;
                this.terminalWriting = false;
                this.current += 1;
            }
        } else if (this.terminalWriting && !this.terminalPending) {
            setTimeout(() => {
                this.pending_choice(text, isFinalUpdate);
            }, 500);
        }
    }

    clear_terminal() {
        for (let i = 0; i < this.row_count; i++) {
            this[`row${i}`].textContent = "";
        }
        this.current = 0;
        this.activeRecursiveCalls = 0;
        this.buffer.empty();
    }

    checkTextQueue() {
        if (this.textQueue.length != 0) {
            this.write_line(this.textQueue[0]);
            this.textQueue.shift();
            this.checkTextQueue();
        }
    }

    terminal_animation(text, row) {
        if (!this.terminalWriting) {
            this.current += 1;
            this.terminalWriting = true;
            let i = 0;
            row.textContent = "";
            const interval = setInterval(() => {
                row.textContent += text[i];
                i++;

                if (i >= text.length) {
                    clearInterval(interval);
                    this.terminalWriting = false;
                    this.checkTextQueue();
                }
            }, 12);
        } else {
            this.textQueue.push(text);
        }
    }
}

// Init Display
const display2 = new Display2(displayContainer);

export function getDisplay2() {
    return display2;
}

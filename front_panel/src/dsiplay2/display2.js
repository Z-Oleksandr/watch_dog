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

    async shift_all_up_one() {
        // Shift all rows up one, ignore last one and add new one
        for (let i = 0; i < this.row_count - 1; i++) {
            this[`row${i}`].textContent = this[`row${i + 1}`].textContent;
            if (i == this.row_count - 2) {
                return Promise.resolve();
            }
        }
    }

    write_line(text) {
        if (this.terminalWriting) {
            this.textQueue.push(text);
            return;
        }
        if (text.length <= 80) {
            this.terminalWriting = true;
            const atBusinessEnd = this.buffer.backToBusiness();
            if (atBusinessEnd != -1) {
                this.render(atBusinessEnd);
            }
            this.buffer.addLine(text);
            if (this.current < this.row_count) {
                const currentRow = this[`row${this.current}`];
                this.terminal_animation(text, currentRow).then(() => {
                    this.terminalWriting = false;
                    this.checkTextQueue();
                });
            } else {
                this.shift_all_up_one().then(() => {
                    const currentRow = this[`row${this.row_count - 1}`];
                    this.terminal_animation(text, currentRow).then(() => {
                        this.terminalWriting = false;
                        this.checkTextQueue();
                    });
                });
            }
        } else {
            this.write_line(text.slice(0, 50));
            setTimeout(() => {
                this.write_line(text.slice(50));
            }, 50);
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

        let rowIndex;
        if (!this.terminalWriting) {
            this.terminalWriting = true;
            this.terminalPending = !isFinalUpdate;
            if (this.current < this.row_count) {
                rowIndex = this.current;
            } else {
                this.shift_all_up_one().then(() => {
                    rowIndex = this.row_count - 1;
                    const row = this[`row${rowIndex}`];
                    row.textContent = text;
                });
            }
        } else if (this.terminalPending) {
            rowIndex =
                this.current < this.row_count
                    ? this.current
                    : this.row_count - 1;
            const row = this[`row${rowIndex}`];
            row.textContent = text;
            if (isFinalUpdate) {
                this.terminalPending = false;
                this.terminalWriting = false;
                this.current += 1;
            }
        } else if (this.terminalWriting && !this.terminalPending) {
            setTimeout(() => {
                this.pending_choice(text, isFinalUpdate);
            }, 420);
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
            this.write_line(this.textQueue.shift());
        }
    }

    async terminal_animation(text, row) {
        return new Promise((res, _) => {
            this.current += 1;
            let i = 0;
            row.textContent = "";
            const interval = setInterval(() => {
                row.textContent += text[i];
                i++;

                if (i >= text.length) {
                    clearInterval(interval);
                    return res();
                }
            }, 12);
        });
    }
}

// Init Display
const display2 = new Display2(displayContainer);

export function getDisplay2() {
    return display2;
}

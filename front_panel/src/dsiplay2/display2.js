import { isMobile } from "../script";

export class Display2 {
    constructor(display) {
        this.container = display;
        this.current = 0;
        this.initialSetupState = true;
        let row_count;
        if (!isMobile()) {
            row_count = 7;
        } else {
            row_count = 4;
        }
        for (let i = 0; i < row_count; i++) {
            this[`row${i}`] = this.create_p(display);
        }
        this.init_message();
        this.terminalWriting = false;
        this.textQueue = [];
    }

    create_p(display) {
        const row = document.createElement("p");
        row.classList.add("display2Row");
        if (!isMobile()) {
            row.style.fontSize = "14px";
        } else {
            row.style.fontSize = "9px";
        }
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

    write_line(text) {
        if (text.length <= 80) {
            if (this.current < 7) {
                const currentRow = this[`row${this.current}`];
                this.terminal_animation(text, currentRow);
            } else {
                const currentRow = this.row6;
                let holdThis1 = currentRow.textContent;
                let holdThis2;
                for (let i = 5; i >= 0; i--) {
                    if (i % 2 !== 0) {
                        holdThis2 = this[`row${i}`].textContent;
                        this[`row${i}`].textContent = holdThis1;
                        if (i != 0) {
                            holdThis1 = this[`row${i - 1}`].textContent;
                        }
                    } else {
                        this[`row${i}`].textContent = holdThis2;
                    }
                }
                this.terminal_animation(text, currentRow);
            }
        } else {
            this.write_line(text.slice(0, 40));
            setTimeout(() => {
                this.write_line(text.slice(40));
            }, 500);
        }
    }

    clear_terminal() {
        for (let i = 0; i < 7; i++) {
            this[`row${i}`].textContent = "";
        }
        this.current = 0;
    }

    checkTextQueue() {
        if (this.textQueue.length != 0) {
            this.write_line(this.textQueue[0]);
            this.textQueue.shift();
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
const display2 = new Display2(document.getElementsByClassName("display_2")[0]);

export function getDisplay2() {
    return display2;
}

export class Buffer {
    constructor(display) {
        this.display = display;
        this.array = [];
        this.arrayLimit = 42;
        this.displayedRows = display.row_count;
        this.visibleRows = {
            start: 0,
            end: 0,
        };
        this.scrolling = false;
    }

    addLine(text) {
        if (this.array.length < this.arrayLimit) {
            this.array.push(text);
            if (
                this.visibleRows.end - this.visibleRows.start <
                this.displayedRows
            ) {
                this.visibleRows.end += 1;
            } else {
                this.visibleRows.start += 1;
                this.visibleRows.end += 1;
            }
        } else {
            this.array.shift();
            this.array.push(text);
        }
    }

    oneUp() {
        if (this.visibleRows.start != 0) {
            this.visibleRows.start -= 1;
            this.visibleRows.end -= 1;
            this.scrolling = true;
            let rowsToShow = [];
            for (let i = 0; i < this.displayedRows; i++) {
                rowsToShow.push(this.array[this.visibleRows.start + i]);
            }
            return rowsToShow;
        } else {
            return -1;
        }
    }

    oneDown() {
        if (this.visibleRows.end < this.array.length - 1) {
            this.visibleRows.start += 1;
            this.visibleRows.end += 1;
            if (this.visibleRows.end == this.array.length - 1) {
                this.scrolling = false;
            }
            let rowsToShow = [];
            for (let i = 0; i < this.displayedRows; i++) {
                rowsToShow.push(this.array[this.visibleRows.start + i]);
            }
            return rowsToShow;
        } else {
            this.scrolling = false;
            return -1;
        }
    }

    empty() {
        this.array = [];
        this.visibleRows = {
            start: 0,
            end: 0,
        };
        this.scrolling = false;
    }

    backToBusiness() {
        if (this.scrolling) {
            this.visibleRows.end = this.array.length - 1;
            this.visibleRows.start = this.visibleRows.end - this.displayedRows;
            let rowsToShow = [];
            for (let i = 0; i < this.displayedRows; i++) {
                rowsToShow.push(this.array[this.visibleRows.start + i]);
            }
            return rowsToShow;
        } else {
            return -1;
        }
    }
}

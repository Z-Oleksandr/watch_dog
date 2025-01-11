import { getDisplay2 } from "./display2";

const display = getDisplay2();

const displayContainer = document.getElementsByClassName("display_2")[0];
const lineHeight = parseInt(display.fontSize, 10) * 2;
let scrollOffset = 0;

export async function displayLogList(logList) {
    if (logList && logList.length != 0) {
        display.write_line("Log list:");
        logList.forEach(([index, log]) => {
            console.log(index + ": " + log);
            display.write_line(index + ": " + log);
        });

        display.write_line("Pick log to display ( -1 to cancel )");

        if (display.textQueue.length == 0) {
            return Promise.resolve();
        }
    }
}

displayContainer.addEventListener("wheel", (event) => {
    event.preventDefault();

    scrollOffset += event.deltaY;

    const linesScrolled = Math.floor(scrollOffset / lineHeight);

    if (linesScrolled != 0) {
        onDisplayScroll(linesScrolled);
        scrollOffset -= linesScrolled * lineHeight;
    }
});

let touchStartY = 0;
let touchOffset = 0;

displayContainer.addEventListener("touchstart", (event) => {
    touchStartY = event.touches[0].clientY;
});

displayContainer.addEventListener("touchmove", (event) => {
    event.preventDefault();

    const touchDeltaY = touchStartY - event.touches[0].clientY;
    touchStartY = event.touches[0].clientY;

    touchOffset += touchDeltaY;
    const linesScrolled = Math.floor(touchOffset / lineHeight);

    if (linesScrolled !== 0) {
        onDisplayScroll(linesScrolled);

        touchOffset -= linesScrolled * lineHeight;
    }
});

function onDisplayScroll(lines) {
    if (lines < 0) {
        for (let i = 0; i > lines; i--) {
            display.scrollUp();
        }
    } else if (lines > 0) {
        for (let i = 0; i < lines; i++) {
            display.scrollDown();
        }
    }
}

import { initDefaultPanel, sweepAll } from "../panel/panel";
import { showGreeting, revealSystemInfo } from "../panel/info_display";

const CONNECT_DELAY_MS = 2000;
const REVEAL_DELAY_MS = 3000;

let sequence_started = false;

initDefaultPanel();
showGreeting();

export function startInitSequence() {
    if (sequence_started) return;
    sequence_started = true;

    setTimeout(() => {
        sweepAll();
        setTimeout(() => {
            revealSystemInfo();
            const cover = document.querySelector(".control2 .cover");
            if (!cover) return;
            cover.classList.add("open");
            setTimeout(() => cover.remove(), 1700);
        }, REVEAL_DELAY_MS);
    }, CONNECT_DELAY_MS);
}

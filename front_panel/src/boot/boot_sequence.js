import { initDefaultPanel, sweepAll } from "../panel/panel";
import { showGreeting } from "../panel/info_display";

initDefaultPanel();
showGreeting();

setTimeout(sweepAll, 400);

setTimeout(() => {
    const cover = document.querySelector(".control2 .cover");
    if (!cover) return;
    cover.classList.add("open");
    setTimeout(() => cover.remove(), 1700);
}, 5000);

import { initDefaultPanel } from "../panel/panel";
import { showGreeting, revealSystemInfo } from "../panel/info_display";

initDefaultPanel();
showGreeting();

setTimeout(() => {
    revealSystemInfo();
    const cover = document.querySelector(".control2 .cover");
    if (!cover) return;
    cover.classList.add("open");
    setTimeout(() => cover.remove(), 1700);
}, 3000);

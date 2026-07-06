import { sweepAll } from "../panel/panel";

const boot_start = performance.now();

function atBootTime(ms, fn) {
    const elapsed = performance.now() - boot_start;
    setTimeout(fn, Math.max(0, ms - elapsed));
}

export function bootOnSystemData() {
    atBootTime(1500, sweepAll);
}

export function bootOnSystemInfo(data) {
    const host = document.querySelector("#boot-overlay .boot-host");
    if (host) {
        host.textContent = (data.host_name || "").toUpperCase();
    }
}

atBootTime(3500, () => {
    const overlay = document.getElementById("boot-overlay");
    if (!overlay) return;
    overlay.classList.add("iris-open");
    setTimeout(() => overlay.remove(), 1200);
});

atBootTime(5000, () => {
    const cover = document.querySelector(".control2 .cover");
    if (!cover) return;
    cover.classList.add("open");
    setTimeout(() => cover.remove(), 1700);
});

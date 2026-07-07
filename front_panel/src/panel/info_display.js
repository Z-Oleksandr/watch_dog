import { formatSecondsToTime } from "../functions/format";

let initialized = false;
let greeting_el = null;

export function showGreeting() {
    if (greeting_el) return greeting_el;
    const display = document.getElementsByClassName("display")[0];
    const container = document.createElement("div");
    container.classList.add("displayGreetingContainer");
    const greeting = document.createElement("p");
    greeting.classList.add("displayGreeting");
    greeting.textContent = "WATCH_DOG";
    const sub = document.createElement("p");
    sub.classList.add("displayGreetingSub");
    sub.textContent = "SYSTEM MONITOR";
    container.append(greeting, sub);
    display.appendChild(container);
    greeting_el = container;
    return container;
}

export function renderSystemInfo(data) {
    if (initialized) return;
    initialized = true;

    const display = document.getElementsByClassName("display")[0];
    const greeting = showGreeting();

    setTimeout(() => {
        greeting.remove();
        greeting_el = null;

        const column1 = document.createElement("div");
        const column2 = document.createElement("div");
        column1.classList.add("column");
        column2.classList.add("column");
        column2.setAttribute("id", "column2");

        Object.entries(data).forEach(([key, value], index) => {
            if (key === "data_type") return;
            const text = document.createElement("p");
            const label = document.createElement("span");
            label.classList.add("spec-key");
            label.textContent = key.replaceAll("_", " ");
            text.appendChild(label);
            const shown = key === "uptime" ? formatSecondsToTime(value) : value;
            text.appendChild(document.createTextNode(shown));
            if (key === "uptime") text.dataset.uptime = "1";
            (index < 5 ? column1 : column2).appendChild(text);
        });

        display.append(column1, column2);
    }, 5000);
}

export function updateUptime(value) {
    const item = document.querySelector(".display p[data-uptime]");
    if (!item) return;
    item.childNodes[1].textContent = formatSecondsToTime(value);
}

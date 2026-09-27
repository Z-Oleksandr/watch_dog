import { formatSecondsToTime } from "../../util/format.js";

const FIRST_COLUMN_ROWS = 5;

/**
 * The "specifications" plaque: a greeting until the boot reveal, then the
 * engine's system info laid out in two columns in wire order.
 */
export class InfoDisplay {
    #root;
    #greeting = null;
    #uptimeNode = null;
    #pending = null;
    #revealed = false;
    #renderedKey = null;

    /** @param {HTMLElement} root */
    constructor(root) {
        this.#root = root;
        this.showGreeting();
    }

    showGreeting() {
        if (this.#greeting) {
            return;
        }
        const container = document.createElement("div");
        container.className = "displayGreetingContainer";
        const greeting = document.createElement("p");
        greeting.className = "displayGreeting";
        greeting.textContent = "WATCH_DOG";
        const sub = document.createElement("p");
        sub.className = "displayGreetingSub";
        sub.textContent = "SYSTEM MONITOR";
        container.append(greeting, sub);
        this.#root.appendChild(container);
        this.#greeting = container;
    }

    /** Called by the boot sequence once the panel may show real data. */
    reveal() {
        this.#revealed = true;
        if (this.#pending) {
            const data = this.#pending;
            this.#pending = null;
            this.#render(data);
        }
    }

    /** @param {object} data  A validated system info frame. */
    render(data) {
        if (this.#revealed) {
            this.#render(data);
        } else {
            this.#pending = data;
        }
    }

    updateUptime(seconds) {
        if (this.#uptimeNode) {
            this.#uptimeNode.textContent = formatSecondsToTime(seconds);
        }
    }

    #render(data) {
        const entries = Object.entries(data).filter(([key]) => key !== "data_type");
        const key = JSON.stringify(entries.filter(([k]) => k !== "uptime"));
        if (key === this.#renderedKey) {
            const uptime = data.uptime;
            if (typeof uptime === "number") {
                this.updateUptime(uptime);
            }
            return;
        }
        this.#renderedKey = key;

        if (this.#greeting) {
            this.#greeting.remove();
            this.#greeting = null;
        }
        this.#root.querySelectorAll(".column").forEach((el) => el.remove());
        this.#uptimeNode = null;

        const column1 = document.createElement("div");
        const column2 = document.createElement("div");
        column1.className = "column";
        column2.className = "column";
        column2.id = "column2";

        entries.forEach(([field, value], index) => {
            const text = document.createElement("p");
            const label = document.createElement("span");
            label.className = "spec-key";
            label.textContent = field.replaceAll("_", " ");
            const valueNode = document.createTextNode(
                field === "uptime" ? formatSecondsToTime(value) : String(value)
            );
            text.append(label, valueNode);
            if (field === "uptime") {
                this.#uptimeNode = valueNode;
            }
            (index < FIRST_COLUMN_ROWS ? column1 : column2).appendChild(text);
        });

        this.#root.append(column1, column2);
    }
}

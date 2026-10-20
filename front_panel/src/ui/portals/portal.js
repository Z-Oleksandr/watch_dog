import { formatLogTimestamp, stripAnsi } from "../../util/format.js";

/** Lines kept per portal; older ones are dropped from the DOM. */
export const MAX_PORTAL_LINES = 500;

const MINIMIZED_STEP_PX = 250;
const MINIMIZED_OFFSET_PX = 2;

/**
 * A draggable window showing one container's output. Owns its DOM and its
 * listeners; `destroy()` releases everything.
 */
export class ContainerOutputPortal {
    #abort = new AbortController();
    #onMinimize;
    #onClose;
    #dragging = false;
    #dragOffset = [0, 0];
    #position = [100, 100];
    #hidden = false;
    #lineCount = 0;

    /**
     * @param {number} channel
     * @param {string} name
     * @param {{ onMinimize: (portal: ContainerOutputPortal) => void,
     *           onClose: (portal: ContainerOutputPortal) => void }} callbacks
     */
    constructor(channel, name, { onMinimize, onClose }) {
        this.channel = channel;
        this.name = name;
        this.#onMinimize = onMinimize;
        this.#onClose = onClose;

        this.root = document.createElement("div");
        this.root.id = `portal${channel}`;
        this.root.className = "portal";
        this.root.setAttribute("role", "dialog");
        this.root.setAttribute("aria-label", `Output of ${name}`);

        const content = document.createElement("div");
        this.header = document.createElement("div");
        this.header.className = "portal-header";
        const title = document.createElement("p");
        title.textContent = name;
        this.header.appendChild(title);

        this.body = document.createElement("div");
        this.body.className = "portal-body";
        this.logContainer = document.createElement("div");
        this.logContainer.className = "log-container";
        this.logContainer.setAttribute("role", "log");
        this.body.appendChild(this.logContainer);

        content.append(this.header, this.body);
        this.root.appendChild(content);

        const controls = document.createElement("div");
        controls.className = "portal-controls";
        this.minButton = this.#button("_", "Minimize");
        this.closeButton = this.#button("X", "Close");
        controls.append(this.minButton, this.closeButton);
        this.root.appendChild(controls);

        document.body.appendChild(this.root);

        const { signal } = this.#abort;
        this.header.addEventListener("pointerdown", (e) => this.#onPointerDown(e), { signal });
        document.addEventListener("pointermove", (e) => this.#onPointerMove(e), { signal });
        document.addEventListener("pointerup", () => this.#onPointerUp(), { signal });
        document.addEventListener("pointercancel", () => this.#onPointerUp(), { signal });
        this.minButton.addEventListener("click", () => this.#toggleMinimized(), { signal });
        this.closeButton.addEventListener("click", () => this.#onClose(this), { signal });
    }

    get hidden() {
        return this.#hidden;
    }

    get lineCount() {
        return this.#lineCount;
    }

    /** Appends a raw engine log line, formatted as `[time] => message`. */
    addLine(rawLine) {
        const [rawTimestamp, ...rest] = rawLine.split(" ");
        const message = stripAnsi(rest.join(" "));
        const line = document.createElement("div");
        line.textContent = `[${formatLogTimestamp(rawTimestamp)}] => ${message}`;
        this.logContainer.appendChild(line);
        this.#lineCount += 1;
        while (this.#lineCount > MAX_PORTAL_LINES && this.logContainer.firstChild) {
            this.logContainer.removeChild(this.logContainer.firstChild);
            this.#lineCount -= 1;
        }
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    /** @param {number} slot  Position among minimized portals. */
    minimize(slot) {
        this.#hidden = true;
        this.root.classList.add("portalMin");
        this.root.style.left = "";
        this.root.style.top = "";
        this.root.style.transform = `translateX(${slot * MINIMIZED_STEP_PX + MINIMIZED_OFFSET_PX}px)`;
        this.header.style.cursor = "default";
        this.body.style.display = "none";
        this.minButton.setAttribute("aria-label", "Restore");
    }

    reposition(slot) {
        if (this.#hidden) {
            this.root.style.transform = `translateX(${slot * MINIMIZED_STEP_PX}px)`;
        }
    }

    restore() {
        this.#hidden = false;
        this.root.classList.remove("portalMin");
        this.root.style.transform = "";
        this.root.style.left = `${this.#position[0]}px`;
        this.root.style.top = `${this.#position[1]}px`;
        this.header.style.cursor = "grab";
        this.body.style.display = "flex";
        this.minButton.setAttribute("aria-label", "Minimize");
    }

    destroy() {
        this.#abort.abort();
        this.root.remove();
    }

    #button(text, label) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "portal-btn";
        button.textContent = text;
        button.setAttribute("aria-label", label);
        return button;
    }

    #toggleMinimized() {
        if (this.#hidden) {
            this.#onMinimize(this, false);
        } else {
            this.#onMinimize(this, true);
        }
    }

    #onPointerDown(event) {
        if (this.#hidden || event.button !== 0) {
            return;
        }
        this.#dragging = true;
        this.#dragOffset = [
            event.clientX - this.root.offsetLeft,
            event.clientY - this.root.offsetTop,
        ];
        this.header.style.cursor = "grabbing";
        try {
            this.header.setPointerCapture(event.pointerId);
        } catch {
            // Capture is best-effort; dragging works without it.
        }
    }

    #onPointerMove(event) {
        if (!this.#dragging) {
            return;
        }
        const width = this.root.offsetWidth;
        const height = this.root.offsetHeight;
        const left = Math.max(
            0,
            Math.min(event.clientX - this.#dragOffset[0], window.innerWidth - width)
        );
        const top = Math.max(
            0,
            Math.min(event.clientY - this.#dragOffset[1], window.innerHeight - height)
        );
        this.#position = [left, top];
        this.root.style.left = `${left}px`;
        this.root.style.top = `${top}px`;
    }

    #onPointerUp() {
        if (!this.#dragging) {
            return;
        }
        this.#dragging = false;
        this.header.style.cursor = "grab";
    }
}

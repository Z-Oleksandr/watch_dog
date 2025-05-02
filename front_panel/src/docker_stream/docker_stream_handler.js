import { getDisplay2 } from "../dsiplay2/display2";
import { portalManager } from "./portalManager";
import { get_container_stream_register } from "../functions/docker";

const display = getDisplay2();

export class ContainerOutputPortal {
    constructor(channel, name) {
        this.channel = channel;

        // Create portal itse;f
        this.portal = document.createElement("div");
        this.portal.id = `portal${channel}`;
        this.portal.classList.add("portal");

        // Create portal content
        this.content = document.createElement("div");
        this.contentHeader = document.createElement("div");
        this.contentHeader.classList.add("portal-header");
        this.contentHeaderText = document.createElement("p");
        this.contentHeaderText.textContent = name;
        this.contentHeader.appendChild(this.contentHeaderText);
        this.contentBody = document.createElement("div");
        this.contentBody.classList.add("portal-body");

        // Create log container inside contentBody
        this.logContainer = document.createElement("div");
        this.logContainer.classList.add("log-container");

        this.contentBody.appendChild(this.logContainer);
        this.content.appendChild(this.contentHeader);
        this.content.appendChild(this.contentBody);

        // Add content to portal and portal to page
        this.portal.appendChild(this.content);
        document
            .getElementsByClassName("thatsAllFolks")[0]
            .appendChild(this.portal);

        // Util portal data
        this.portalWidth = this.portal.offsetWidth;
        this.portalHeight = this.portal.offsetHeight;

        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this.contentHeader.addEventListener("mousedown", this._onMouseDown);
        document.addEventListener("mouseup", this._onMouseUp);
        document.addEventListener("mousemove", this._onMouseMove);

        // Create portal controls
        [this.portalControlMin, this.portalControlX] = createPortalControls(
            this.portal
        );

        this.offsetXY = [0, 0];
        this.positionXY = [100, 100];
        this.hidden = false;
        this.dragging = false;

        this.portalControlMin.addEventListener("click", () => {
            if (!this.hidden) {
                hidePortal(this);
            } else {
                showPortal(this);
            }
        });

        this.portalControlX.addEventListener("click", () => {
            portalManager.close(this.channel);
        });
    }

    _onMouseDown(e) {
        if (!this.hidden) {
            this.dragging = true;
            this.offsetXY[0] = e.clientX - this.portal.offsetLeft;
            this.offsetXY[1] = e.clientY - this.portal.offsetTop;
            this.contentHeader.style.cursor = "grabbing";
        }
    }

    _onMouseUp() {
        this.dragging = false;
        this.contentHeader.style.cursor = "grab";
    }

    _onMouseMove(e) {
        if (this.dragging) {
            let left = e.clientX - this.offsetXY[0];
            let top = e.clientY - this.offsetXY[1];

            left = Math.max(
                0,
                Math.min(left, window.innerWidth - this.portalWidth)
            );
            top = Math.max(
                0,
                Math.min(top, window.innerHeight - this.portalHeight)
            );

            this.positionXY = [left, top];

            this.portal.style.left = `${left}px`;
            this.portal.style.top = `${top}px`;
        }
    }

    destroy() {
        // Remove from DOM
        if (this.portal?.parentElement) {
            this.portal.parentElement.removeChild(this.portal);
        }

        document.removeEventListener("mousedown", this._onMouseDown);
        document.removeEventListener("mouseup", this._onMouseUp);
        document.removeEventListener("mousemove", this._onMouseMove);

        // Clean up properties
        Object.keys(this).forEach((key) => {
            this[key] = null;
        });
    }

    addLine(line) {
        const lineDiv = document.createElement("div");
        lineDiv.textContent = line;
        this.logContainer.appendChild(lineDiv);

        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }
}

export function write_container_log_to_portal(index, channel, rawLog) {
    const containerStreamRegister = get_container_stream_register();
    const portal = portalManager.create(
        channel,
        containerStreamRegister.list[index]
    );
    const [rawTimeStamp, ...messageParts] = rawLog.split(" ");
    const message = messageParts.join(" ");

    const formattedTime = formatTimestamp(rawTimeStamp);

    const cleanMessage = message.replace(/\x1b\[[0-9;]*m/g, "");

    const log = `[${formattedTime}] => ${cleanMessage}`;

    portal.addLine(log);
}

function formatTimestamp(time) {
    try {
        const date = new Date(time);
        return date.toLocaleString("de-DE", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch (e) {
        return time;
    }
}

function createPortalControls(portal) {
    const portalControls = document.createElement("div");
    portalControls.classList.add("portal-controls");

    const buttonMin = document.createElement("div");
    buttonMin.classList.add("portal-btn");
    buttonMin.textContent = "_";

    const buttonX = document.createElement("div");
    buttonX.classList.add("portal-btn");
    buttonX.textContent = "X";

    portalControls.appendChild(buttonMin);
    portalControls.appendChild(buttonX);

    portal.appendChild(portalControls);

    return [buttonMin, buttonX];
}

function hidePortal(containerOutputPortal) {
    containerOutputPortal.hidden = true;
    const portal = containerOutputPortal.portal;
    const contentBody = containerOutputPortal.contentBody;

    if (!portalManager.hiddenList.includes(containerOutputPortal)) {
        portalManager.hiddenList.push(containerOutputPortal);
    }

    portal.style.left = "";
    portal.style.top = "";
    portal.style.right = "";
    portal.style.bottom = "";
    portal.style.transform = "";
    portal.classList.add("portalMin");

    const index = portalManager.hiddenList.indexOf(containerOutputPortal);
    portal.style.transform = `translateX(${index * 250 + 2}px)`;

    containerOutputPortal.contentHeader.style.cursor = "default";
    contentBody.style.display = "none";
}

function showPortal(containerOutputPortal) {
    containerOutputPortal.hidden = false;
    const portal = containerOutputPortal.portal;
    const contentBody = containerOutputPortal.contentBody;
    portal.classList.remove("portalMin");
    portal.style.left = `${containerOutputPortal.positionXY[0]}px`;
    portal.style.top = `${containerOutputPortal.positionXY[1]}px`;
    containerOutputPortal.contentHeader.style.cursor = "grab";
    contentBody.style.display = "flex";

    const index = portalManager.hiddenList.indexOf(containerOutputPortal);
    if (index !== -1) {
        portalManager.hiddenList.splice(index, 1);
    }
    portalManager.repositionHiddens();
}

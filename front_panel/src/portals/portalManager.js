import { OutputPortal } from "./output_portal";
import { sendWSMessage } from "../script";

const portals = new Map();

export const portalManager = {
    create(channel, name) {
        if (!portals.has(channel)) {
            const portal = new OutputPortal(channel, name);
            portals.set(channel, portal);
        }
        return portals.get(channel);
    },

    get(channel) {
        return portals.get(channel) || null;
    },

    close(channel) {
        const portalInstance = portals.get(channel);
        if (!portalInstance) return;

        if (this.hiddenList.includes(portalInstance)) {
            const index = this.hiddenList.indexOf(portalInstance);
            if (index !== -1) {
                this.hiddenList.splice(index, 1);
            }
            this.repositionHiddens();
        }

        portalInstance.destroy();
        // Remove from manager
        portals.delete(channel);
        console.log("Closing", channel);
        sendWSMessage("stop_container_output", Number(channel));
    },

    closeAll() {
        for (const channel of portals.keys()) {
            this.close(channel);
        }
    },

    exists(channel) {
        return portals.has(channel);
    },

    hiddenList: [],

    repositionHiddens() {
        this.hiddenList.forEach((portal, index) => {
            portal.portal.style.transform = `translateX(${index * 250}px)`;
        });
    },
};

import { log } from "../../util/logger.js";
import { ContainerOutputPortal } from "./portal.js";

/**
 * Creates, minimizes and closes container output portals, one per channel.
 * Closing notifies the owner (which tells the engine to stop the stream).
 */
export class PortalManager {
    #portals = new Map();
    #minimized = [];
    #onClosed;

    /** @param {{ onClosed: (channel: number) => void }} callbacks */
    constructor({ onClosed }) {
        this.#onClosed = onClosed;
    }

    get size() {
        return this.#portals.size;
    }

    has(channel) {
        return this.#portals.has(channel);
    }

    get(channel) {
        return this.#portals.get(channel) ?? null;
    }

    /** Returns the existing portal for a channel or creates one. */
    open(channel, name) {
        let portal = this.#portals.get(channel);
        if (!portal) {
            portal = new ContainerOutputPortal(channel, name, {
                onMinimize: (p, minimize) => (minimize ? this.#minimize(p) : this.#restore(p)),
                onClose: (p) => this.close(p.channel),
            });
            this.#portals.set(channel, portal);
        }
        return portal;
    }

    close(channel) {
        const portal = this.#portals.get(channel);
        if (!portal) {
            return false;
        }
        this.#forgetMinimized(portal);
        portal.destroy();
        this.#portals.delete(channel);
        log.info("portals", "closed", { channel });
        this.#onClosed(channel);
        return true;
    }

    closeAll() {
        for (const channel of [...this.#portals.keys()]) {
            this.close(channel);
        }
    }

    #minimize(portal) {
        if (!this.#minimized.includes(portal)) {
            this.#minimized.push(portal);
        }
        portal.minimize(this.#minimized.indexOf(portal));
    }

    #restore(portal) {
        portal.restore();
        this.#forgetMinimized(portal);
    }

    #forgetMinimized(portal) {
        const index = this.#minimized.indexOf(portal);
        if (index === -1) {
            return;
        }
        this.#minimized.splice(index, 1);
        this.#minimized.forEach((p, slot) => p.reposition(slot));
    }
}

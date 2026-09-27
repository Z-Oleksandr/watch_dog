import { channelFor } from "../protocol/channels.js";

/**
 * Tracks which container output streams the panel has asked for, keyed by
 * their channel. Replaces the parallel `count`/`channels`/`list` fields.
 */
export class StreamRegistry {
    #streams = new Map();
    #names = new Map();

    /** @param {Record<string, string>} list  Container index -> name, as sent by the engine. */
    setContainerNames(list) {
        this.#names = new Map(Object.entries(list).map(([index, name]) => [Number(index), name]));
    }

    get containerCount() {
        return this.#names.size;
    }

    /** @returns {Array<[number, string]>} sorted by index */
    containers() {
        return [...this.#names.entries()].sort((a, b) => a[0] - b[0]);
    }

    /**
     * Registers a stream for a container and returns its channel. Registering
     * twice is idempotent.
     * @param {number} index
     */
    open(index) {
        const channel = channelFor(index);
        if (!this.#streams.has(channel)) {
            this.#streams.set(channel, {
                index,
                name: this.#names.get(index) ?? `container ${index}`,
            });
        }
        return channel;
    }

    close(channel) {
        return this.#streams.delete(channel);
    }

    has(channel) {
        return this.#streams.has(channel);
    }

    nameFor(channel) {
        const entry = this.#streams.get(channel);
        return entry ? entry.name : null;
    }

    get size() {
        return this.#streams.size;
    }

    channels() {
        return [...this.#streams.keys()];
    }

    clear() {
        this.#streams.clear();
    }
}

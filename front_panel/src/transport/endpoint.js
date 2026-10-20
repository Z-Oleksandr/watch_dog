/**
 * Resolves the WebSocket URL. The panel talks to the engine through the
 * front panel host's `/ws` proxy on the same origin, so the scheme follows
 * the page and only one port needs to be reachable.
 *
 * Development builds accept `?ws=ws://host:8999` to point at a remote engine
 * directly; the parameter is ignored in production builds.
 *
 * @param {{ protocol: string, host: string, search?: string }} location
 */
export function resolveSocketUrl(location) {
    if (__DEV__ && location.search) {
        const override = new URLSearchParams(location.search).get("ws");
        if (override && /^wss?:\/\//.test(override)) {
            return override;
        }
    }
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${location.host}/ws`;
}

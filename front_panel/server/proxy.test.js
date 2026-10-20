import http from "node:http";
import net from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createWsProxy } from "./proxy.js";
import { log } from "./log.js";

const REFUSED_PATH = "/ws/refused";

let engine;
let engineRequests;
let engineSockets;
let front;
let frontPort;

function listen(server) {
    return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server) {
    return new Promise((resolve) => server.close(resolve));
}

function createEchoEngine() {
    const server = http.createServer((_req, res) => res.writeHead(426).end());
    server.on("upgrade", (req, socket, head) => {
        engineRequests.push({ url: req.url, headers: req.headers });
        if (req.url === REFUSED_PATH) {
            socket.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
            return;
        }
        socket.write(
            "HTTP/1.1 101 Switching Protocols\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                "X-Engine: echo\r\n\r\n"
        );
        if (head.length > 0) {
            socket.write(head);
        }
        engineSockets.add(socket);
        socket.once("close", () => engineSockets.delete(socket));
        socket.pipe(socket);
    });
    return server;
}

function createFront(target) {
    const proxy = createWsProxy({ path: "/ws", target });
    const server = http.createServer((_req, res) => res.writeHead(404).end());
    server.on("upgrade", proxy.upgrade);
    return server;
}

function requestUpgrade(port, path, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: "127.0.0.1",
            port,
            path,
            headers: { Connection: "Upgrade", Upgrade: "websocket", ...headers },
        });
        req.on("upgrade", (res, socket) => resolve({ res, socket }));
        req.on("response", (res) => {
            res.resume();
            resolve({ res });
        });
        req.on("error", reject);
        req.end();
    });
}

function readOnce(socket) {
    return new Promise((resolve) => socket.once("data", (chunk) => resolve(chunk.toString())));
}

async function unusedPort() {
    const probe = net.createServer();
    await listen(probe);
    const { port } = probe.address();
    await close(probe);
    return port;
}

beforeAll(async () => {
    log.setLevel("off");
    engineRequests = [];
    engineSockets = new Set();
    engine = createEchoEngine();
    await listen(engine);
    front = createFront({ host: "127.0.0.1", port: engine.address().port });
    await listen(front);
    frontPort = front.address().port;
});

afterAll(async () => {
    for (const socket of engineSockets) {
        socket.destroy();
    }
    front.closeAllConnections();
    engine.closeAllConnections();
    await Promise.all([close(front), close(engine)]);
    log.setLevel("info");
});

describe("createWsProxy", () => {
    it("relays_bytes_both_ways_after_the_engine_switches_protocols", async () => {
        const { res, socket } = await requestUpgrade(frontPort, "/ws");
        expect(res.statusCode).toBe(101);
        socket.write("ping");
        expect(await readOnce(socket)).toBe("ping");
        socket.destroy();
    });

    it("passes_the_engine_handshake_headers_to_the_client", async () => {
        const { res, socket } = await requestUpgrade(frontPort, "/ws");
        expect(res.headers["x-engine"]).toBe("echo");
        socket.destroy();
    });

    it("forwards_path_query_and_host_unchanged", async () => {
        engineRequests.length = 0;
        const { socket } = await requestUpgrade(frontPort, "/ws?stream=1", {
            Host: "panel.local:9000",
        });
        expect(engineRequests[0]).toMatchObject({
            url: "/ws?stream=1",
            headers: { host: "panel.local:9000" },
        });
        expect(engineRequests[0].headers["x-forwarded-for"]).toBeUndefined();
        socket.destroy();
    });

    it("rejects_upgrades_outside_the_proxied_path_with_404", async () => {
        const { res } = await requestUpgrade(frontPort, "/wsx");
        expect(res.statusCode).toBe(404);
    });

    it("rejects_non_websocket_upgrades_with_400", async () => {
        const { res } = await requestUpgrade(frontPort, "/ws", { Upgrade: "h2c" });
        expect(res.statusCode).toBe(400);
    });

    it("relays_an_engine_refusal_status", async () => {
        const { res } = await requestUpgrade(frontPort, REFUSED_PATH);
        expect(res.statusCode).toBe(403);
    });

    it("answers_502_when_the_engine_is_unreachable", async () => {
        const deadFront = createFront({ host: "127.0.0.1", port: await unusedPort() });
        await listen(deadFront);
        const { res } = await requestUpgrade(deadFront.address().port, "/ws");
        expect(res.statusCode).toBe(502);
        await close(deadFront);
    });

    it("closes_the_client_when_the_engine_drops_the_connection", async () => {
        const { socket } = await requestUpgrade(frontPort, "/ws");
        const closed = new Promise((resolve) => socket.once("close", resolve));
        for (const engineSocket of engineSockets) {
            engineSocket.destroy();
        }
        await closed;
        expect(socket.destroyed).toBe(true);
    });
});

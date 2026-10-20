"use strict";

const http = require("http");

const { log } = require("./log");

/**
 * WebSocket reverse proxy built on `node:http` alone. It forwards upgrade
 * requests on one path to the engine and then relays bytes in both
 * directions. Plain HTTP requests are never proxied: the engine only speaks
 * WebSocket, so the Express app answers everything else.
 *
 * The `Host` header and the client address are forwarded unchanged (no
 * `X-Forwarded-*`), matching the panel's same-origin deployment.
 *
 * @param {{ path: string, target: { host: string, port: number } }} options
 * @returns {{ upgrade: (req: http.IncomingMessage, socket: import("net").Socket, head: Buffer) => void }}
 */
function createWsProxy({ path, target }) {
    function upgrade(req, socket, head) {
        if (!matchesPath(req.url, path)) {
            rejectUpgrade(socket, 404, "Not Found");
            return;
        }
        if (!isWebSocketUpgrade(req)) {
            rejectUpgrade(socket, 400, "Bad Request");
            return;
        }

        log.info("proxy", "websocket upgrade", { from: req.socket.remoteAddress });
        socket.on("error", (err) => log.debug("proxy", "client socket error", { code: err.code }));

        const engineReq = http.request({
            host: target.host,
            port: target.port,
            method: req.method,
            path: req.url,
            headers: req.headers,
        });

        engineReq.on("upgrade", (engineRes, engineSocket, engineHead) => {
            bridge(socket, head, engineRes, engineSocket, engineHead);
        });
        engineReq.on("response", (engineRes) => relayRefusal(socket, engineRes));
        engineReq.on("error", (err) => {
            log.warn("proxy", "engine unreachable", { code: err.code, url: req.url });
            rejectUpgrade(socket, 502, "Bad Gateway");
        });
        socket.once("close", () => engineReq.destroy());

        engineReq.end();
    }

    return { upgrade };
}

function matchesPath(url, path) {
    const pathname = (url || "").split("?", 1)[0];
    return pathname === path || pathname.startsWith(`${path}/`);
}

function isWebSocketUpgrade(req) {
    return req.method === "GET" && /^websocket$/i.test(req.headers.upgrade || "");
}

/**
 * Completes the client handshake with the engine's own 101 response, then
 * pipes both sockets. Bytes that arrived with either handshake are replayed
 * first, and closing one side tears down the other.
 */
function bridge(clientSocket, clientHead, engineRes, engineSocket, engineHead) {
    if (clientSocket.destroyed) {
        engineSocket.destroy();
        return;
    }

    for (const peer of [clientSocket, engineSocket]) {
        peer.setTimeout(0);
        peer.setNoDelay(true);
        peer.setKeepAlive(true, 0);
    }

    engineSocket.on("error", (err) => {
        log.debug("proxy", "engine socket error", { code: err.code });
        clientSocket.destroy();
    });
    clientSocket.on("error", () => engineSocket.destroy());
    engineSocket.on("close", () => clientSocket.destroy());
    clientSocket.on("close", () => engineSocket.destroy());

    clientSocket.write(
        responseHead(engineRes.statusCode, engineRes.statusMessage, engineRes.rawHeaders)
    );
    if (engineHead && engineHead.length > 0) {
        clientSocket.write(engineHead);
    }
    if (clientHead && clientHead.length > 0) {
        engineSocket.write(clientHead);
    }

    engineSocket.pipe(clientSocket);
    clientSocket.pipe(engineSocket);
}

/** Answers the client with the engine's refusal status (e.g. 400, 403). */
function relayRefusal(clientSocket, engineRes) {
    engineRes.resume();
    rejectUpgrade(clientSocket, engineRes.statusCode, engineRes.statusMessage || "Upgrade Refused");
}

function rejectUpgrade(socket, status, reason) {
    if (socket.writable) {
        const body = JSON.stringify({ error: reason });
        socket.end(
            `HTTP/1.1 ${status} ${reason}\r\n` +
                "Connection: close\r\n" +
                "Content-Type: application/json\r\n" +
                `Content-Length: ${Buffer.byteLength(body)}\r\n` +
                `\r\n${body}`
        );
    }
}

function responseHead(status, message, rawHeaders) {
    const lines = [`HTTP/1.1 ${status} ${message || ""}`.trimEnd()];
    for (let i = 0; i < rawHeaders.length; i += 2) {
        lines.push(`${rawHeaders[i]}: ${rawHeaders[i + 1]}`);
    }
    return `${lines.join("\r\n")}\r\n\r\n`;
}

module.exports = { createWsProxy };

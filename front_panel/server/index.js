"use strict";

const http = require("http");

const { loadConfig, ConfigError } = require("./config");
const { createApp } = require("./app");
const { log } = require("./log");

function main() {
    let config;
    try {
        config = loadConfig();
    } catch (err) {
        if (err instanceof ConfigError) {
            process.stderr.write(`front_panel: ${err.message}\n`);
            process.exit(2);
        }
        throw err;
    }

    if (!log.setLevel(config.logLevel)) {
        log.warn("config", "unknown FRONT_PANEL_LOG level, using info", { level: config.logLevel });
    }

    const { app, wsProxy } = createApp(config);
    const server = http.createServer(app);

    // Upgraded sockets detach from the HTTP server, so track them here to be
    // able to close them on shutdown.
    const upgraded = new Set();
    server.on("upgrade", (_req, socket) => {
        upgraded.add(socket);
        socket.once("close", () => upgraded.delete(socket));
    });
    server.on("upgrade", wsProxy.upgrade);

    server.on("error", (err) => {
        log.error("server", "listen failed", { err, bind: config.bind, port: config.port });
        process.exit(1);
    });

    server.listen(config.port, config.bind, () => {
        log.info("server", "front_panel listening", {
            url: `http://${config.bind}:${config.port}`,
            engine: config.engine.url,
        });
    });

    let shuttingDown = false;
    function shutdown(signal) {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        log.info("server", "shutting down", { signal, openSockets: upgraded.size });

        const force = setTimeout(() => {
            log.warn("server", "shutdown grace period elapsed, exiting");
            process.exit(1);
        }, config.shutdownGraceMs);
        force.unref();

        server.close(() => {
            log.info("server", "closed");
            process.exit(0);
        });
        for (const socket of upgraded) {
            socket.destroy();
        }
        if (typeof server.closeIdleConnections === "function") {
            server.closeIdleConnections();
        }
    }

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("unhandledRejection", (reason) => {
        log.error("process", "unhandled rejection", { reason });
        shutdown("unhandledRejection");
    });
    process.on("uncaughtException", (err) => {
        log.error("process", "uncaught exception", { err });
        process.exit(1);
    });
}

main();

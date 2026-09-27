"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const { log } = require("./log");

/** Webpack emits `name.<contenthash>.ext`; those files never change in place. */
const HASHED_ASSET = /\.[0-9a-f]{16,}\.(js|css|map)$/i;
const LONG_LIVED_ASSET = /\.(ttf|otf|woff2?|png|jpe?g|webp|gltf|bin|mp3|ico)$/i;

const ONE_YEAR_S = 31_536_000;
const ONE_DAY_S = 86_400;

/**
 * Content Security Policy for the panel. Everything the page needs is served
 * from this origin; the WebSocket is same-origin too, so `connect-src 'self'`
 * covers ws/wss. Inline scripts and styles are not needed and stay blocked.
 */
const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
].join("; ");

function securityHeaders(_req, res, next) {
    res.set({
        "Content-Security-Policy": CSP,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "same-origin",
    });
    next();
}

function cacheHeaders(res, filePath) {
    const name = path.basename(filePath);
    if (name.endsWith(".html")) {
        res.set("Cache-Control", "no-cache");
    } else if (HASHED_ASSET.test(name)) {
        res.set("Cache-Control", `public, max-age=${ONE_YEAR_S}, immutable`);
    } else if (LONG_LIVED_ASSET.test(name)) {
        res.set("Cache-Control", `public, max-age=${ONE_DAY_S}`);
    } else {
        res.set("Cache-Control", "no-cache");
    }
}

function staticDir(dir) {
    return express.static(dir, {
        dotfiles: "ignore",
        index: "index.html",
        redirect: false,
        setHeaders: cacheHeaders,
    });
}

/**
 * Builds the Express app and the WebSocket proxy. The proxy's `upgrade`
 * handler must be attached to the HTTP server by the caller so upgrades are
 * routed even before any HTTP request has been proxied.
 *
 * @param {import("./config").Config} config
 */
function createApp(config) {
    if (!fs.existsSync(path.join(config.distDir, "index.html")) && !fs.existsSync(path.join(config.publicDir, "index.html"))) {
        log.warn("app", "no index.html found; run `npm run build` first", {
            distDir: config.distDir,
        });
    }

    const app = express();
    app.disable("x-powered-by");
    app.set("etag", "strong");

    app.use(securityHeaders);

    app.get("/health", (_req, res) => {
        res.set("Cache-Control", "no-store");
        res.json({ status: "ok" });
    });

    const wsProxy = createProxyMiddleware({
        pathFilter: "/ws",
        target: config.engine.url,
        ws: true,
        changeOrigin: false,
        xfwd: false,
        logger: proxyLogger(),
        on: {
            error: onProxyError,
            proxyReqWs: (_proxyReq, req) => {
                log.info("proxy", "websocket upgrade", { from: req.socket.remoteAddress });
            },
        },
    });
    app.use(wsProxy);

    app.use(staticDir(config.distDir));
    app.use(staticDir(config.publicDir));

    app.use((req, res) => {
        res.status(404).json({ error: "Not found" });
    });

    // eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
    app.use((err, req, res, next) => {
        log.error("app", "request failed", { method: req.method, url: req.originalUrl, err });
        if (res.headersSent) {
            return;
        }
        res.status(500).json({ error: "Internal server error" });
    });

    return { app, wsProxy };
}

function onProxyError(err, req, resOrSocket) {
    log.warn("proxy", "engine unreachable", { code: err.code, url: req && req.url });
    if (!resOrSocket) {
        return;
    }
    if (typeof resOrSocket.writeHead === "function" && !resOrSocket.headersSent) {
        resOrSocket.writeHead(502, { "Content-Type": "application/json" });
        resOrSocket.end(JSON.stringify({ error: "Engine unavailable" }));
        return;
    }
    if (typeof resOrSocket.destroy === "function") {
        resOrSocket.destroy();
    }
}

function proxyLogger() {
    return {
        info: (...args) => log.debug("proxy", args.map(String).join(" ")),
        warn: (...args) => log.warn("proxy", args.map(String).join(" ")),
        // Errors are reported once by onProxyError with structured context.
        error: (...args) => log.debug("proxy", args.map(String).join(" ")),
    };
}

module.exports = { createApp, CSP };

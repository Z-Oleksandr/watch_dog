import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp, CSP } from "./app.js";
import { loadConfig } from "./config.js";

let server;
let baseUrl;
let tmpRoot;

beforeAll(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "front-panel-"));
    const distDir = path.join(tmpRoot, "dist");
    const publicDir = path.join(tmpRoot, "public");
    fs.mkdirSync(distDir);
    fs.mkdirSync(path.join(publicDir, "css"), { recursive: true });
    fs.writeFileSync(path.join(distDir, "index.html"), "<!doctype html><title>t</title>");
    fs.writeFileSync(path.join(distDir, "main.0123456789abcdef0123.js"), "// hashed");
    fs.writeFileSync(path.join(publicDir, "css", "deco.css"), "body{}");
    fs.writeFileSync(path.join(publicDir, ".secret"), "nope");

    const config = { ...loadConfig({}), distDir, publicDir };
    const { app } = createApp(config);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("createApp", () => {
    it("serves_health_without_caching", async () => {
        const res = await fetch(`${baseUrl}/health`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: "ok" });
        expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("sets_security_headers_on_every_response", async () => {
        const res = await fetch(`${baseUrl}/`);
        expect(res.headers.get("content-security-policy")).toBe(CSP);
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
        expect(res.headers.get("x-frame-options")).toBe("DENY");
        expect(res.headers.get("referrer-policy")).toBe("no-referrer");
        expect(res.headers.get("x-powered-by")).toBeNull();
    });

    it("serves_the_built_index_from_dist", async () => {
        const res = await fetch(`${baseUrl}/`);
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("no-cache");
        expect(await res.text()).toContain("<title>t</title>");
    });

    it("marks_hashed_assets_immutable", async () => {
        const res = await fetch(`${baseUrl}/main.0123456789abcdef0123.js`);
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toContain("immutable");
    });

    it("revalidates_stylesheets", async () => {
        const res = await fetch(`${baseUrl}/css/deco.css`);
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("no-cache");
    });

    it("does_not_serve_dotfiles_or_source", async () => {
        expect((await fetch(`${baseUrl}/.secret`)).status).toBe(404);
        expect((await fetch(`${baseUrl}/server/index.js`)).status).toBe(404);
        expect((await fetch(`${baseUrl}/src/main.js`)).status).toBe(404);
    });

    it("returns_json_for_unknown_paths", async () => {
        const res = await fetch(`${baseUrl}/nope`);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "Not found" });
    });
});

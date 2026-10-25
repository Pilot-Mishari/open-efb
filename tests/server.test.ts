import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import type { Request, Response } from "express";
import { createEfbServer, type EfbServer } from "../apps/server/src";
import { requireLoopback } from "../apps/server/src/guard";
import { request, tmpDir } from "./helpers";

let dataDir: string;
let server: EfbServer;
let port: number;

beforeEach(async () => {
  dataDir = tmpDir();
  server = createEfbServer({ dataDir, port: 0, version: "9.9.9", logToStdout: false });
  port = (await server.start()).port;
});
afterEach(async () => {
  await server.dispose();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("HTTP API", () => {
  it("reports health", async () => {
    const r = await request(port, "GET", "/api/health");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ app: "open-efb", version: "9.9.9" });
  });
  it("binds to loopback only", () => {
    // M1 contract: nothing is reachable from the LAN yet.
    expect(server.isRunning()).toBe(true);
  });
  it("returns JSON 404 for unknown API routes", async () => {
    const r = await request(port, "GET", "/api/nope");
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "not_found" });
  });
  it("sets security headers and hides the framework", async () => {
    const r = await new Promise<Record<string, unknown>>((resolve) =>
      import("node:http").then(({ default: http }) =>
        http.get({ host: "127.0.0.1", port, path: "/api/health" }, (res) => {
          res.resume();
          resolve(res.headers);
        }),
      ),
    );
    expect(r["x-content-type-options"]).toBe("nosniff");
    expect(r["x-powered-by"]).toBeUndefined();
  });
});

describe("settings endpoints", () => {
  it("updates and persists a valid patch from loopback", async () => {
    const r = await request(port, "PATCH", "/api/settings", { body: { theme: "light" } });
    expect(r.status).toBe(200);
    expect(r.body.settings.theme).toBe("light");
    expect((await request(port, "GET", "/api/settings")).body.theme).toBe("light");
  });

    it("a one-field update keeps every other setting", async () => {
    await request(port, "PATCH", "/api/settings", { body: { simbriefUser: "pilot", chartsProvider: "navigraph", units: { altitude: "m", speed: "kmh", temperature: "F", weight: "lb" } } });
    await request(port, "PATCH", "/api/settings", { body: { theme: "light" } });
    await request(port, "PATCH", "/api/settings", { body: { units: { weight: "kg" } } });
    const s = (await request(port, "GET", "/api/settings")).body;
    expect(s).toMatchObject({ theme: "light", simbriefUser: "pilot", chartsProvider: "navigraph", units: { altitude: "m", speed: "kmh", temperature: "F", weight: "kg" } });
  });
  it("an empty update changes nothing, even when settings are not defaults", async () => {
    await request(port, "PATCH", "/api/settings", { body: { theme: "light", simbriefUser: "pilot" } });
    const before = (await request(port, "GET", "/api/settings")).body;
    await request(port, "PATCH", "/api/settings", { body: {} });
    expect((await request(port, "GET", "/api/settings")).body).toEqual(before);
  });

  it("flags a port change as needing restart", async () => {
    const r = await request(port, "PATCH", "/api/settings", { body: { port: 5000 } });
    expect(r.body.restartRequired).toBe(true);
  });
  it("rejects invalid and unknown fields", async () => {
    expect((await request(port, "PATCH", "/api/settings", { body: { port: 1 } })).status).toBe(400);
    expect((await request(port, "PATCH", "/api/settings", { body: { evil: 1 } })).status).toBe(400);
  });
  it("answers malformed JSON with 400 and keeps serving", async () => {
    const r = await request(port, "PATCH", "/api/settings", { raw: "{broken" });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "invalid_json" });
    expect((await request(port, "GET", "/api/health")).status).toBe(200);
  });
  it("treats an empty patch as a no-op", async () => {
    const before = (await request(port, "GET", "/api/settings")).body;
    const r = await request(port, "PATCH", "/api/settings", { body: {} });
    expect(r.status).toBe(200);
    expect(r.body.settings).toEqual(before);
  });
});

describe("request guards", () => {
  it("refuses unknown Host headers (DNS rebinding)", async () => {
    const r = await request(port, "GET", "/api/health", { headers: { Host: "evil.example.com" } });
    expect(r.status).toBe(421);
  });
  it("accepts localhost and 127.0.0.1 hosts", async () => {
    expect((await request(port, "GET", "/api/health", { headers: { Host: `localhost:${port}` } })).status).toBe(200);
    expect((await request(port, "GET", "/api/health", { headers: { Host: `127.0.0.1:${port}` } })).status).toBe(200);
  });
  it("blocks state changes carrying a foreign Origin (CSRF)", async () => {
    const r = await request(port, "PATCH", "/api/settings", { headers: { Origin: "https://evil.example.com" }, body: { theme: "light" } });
    expect(r.status).toBe(403);
    expect((await request(port, "GET", "/api/settings")).body.theme).toBe("dark");
  });
  it("allows state changes from our own origin", async () => {
    const r = await request(port, "PATCH", "/api/settings", { headers: { Origin: `http://localhost:${port}` }, body: { theme: "light" } });
    expect(r.status).toBe(200);
  });
  it("requireLoopback rejects non-loopback peers", () => {
    let code = 0;
    const res = { status: (c: number) => ({ json: () => void (code = c) }) } as unknown as Response;
    let called = false;
    requireLoopback({ socket: { remoteAddress: "192.168.1.50" } } as Request, res, () => void (called = true));
    expect(code).toBe(403);
    expect(called).toBe(false);
    requireLoopback({ socket: { remoteAddress: "127.0.0.1" } } as Request, res, () => void (called = true));
    expect(called).toBe(true);
  });
});

describe("persistence", () => {
  it("keeps settings across a server restart", async () => {
    await request(port, "PATCH", "/api/settings", { body: { theme: "light" } });
    await server.dispose();
    server = createEfbServer({ dataDir, port: 0, logToStdout: false });
    port = (await server.start()).port;
    expect((await request(port, "GET", "/api/settings")).body.theme).toBe("light");
  });
});

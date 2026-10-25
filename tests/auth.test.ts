import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { createEfbServer, type EfbServer } from "../apps/server/src";
import { request, tmpDir } from "./helpers";

let dataDir: string;
let server: EfbServer;

afterEach(async () => {
  await server.dispose();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function boot(remote: boolean): Promise<number> {
  dataDir = tmpDir();
  server = createEfbServer({ dataDir, port: 0, logToStdout: false, ...(remote ? { isLocal: () => false, pairing: { random: () => 1234 } } : {}) });
  if (remote) server.settings.update({ lanAccessEnabled: true });
  return (await server.start()).port;
}

describe("/api/telemetry authentication", () => {
  it("rejects an unpaired request with 401", async () => {
    const port = await boot(true);
    const r = await request(port, "GET", "/api/telemetry");
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: "unauthorized" });
  });

  it("rejects a bad session cookie with 401", async () => {
    const port = await boot(true);
    const r = await request(port, "GET", "/api/telemetry", { headers: { Cookie: "efb_session=not-a-real-token" } });
    expect(r.status).toBe(401);
  });

  it("serves telemetry to a paired device", async () => {
    const port = await boot(true);
    const pair = await request(port, "POST", "/api/pair", { body: { code: "1234" } });
    expect(pair.status).toBe(200);
    const cookie = String(pair.headers["set-cookie"]?.[0] ?? "").split(";")[0]!;
    expect(cookie).toMatch(/^efb_session=/);
    const r = await request(port, "GET", "/api/telemetry", { headers: { Cookie: cookie } });
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("serverTime");
  });

  it("serves telemetry to the local PC without pairing", async () => {
    const port = await boot(false);
    const r = await request(port, "GET", "/api/telemetry");
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("serverTime");
  });
});
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { WebSocket, WebSocketServer } from "ws";
import type { Logger } from "pino";
import { GsxStatusSchema, emptyGsxStatus } from "../packages/shared/src";
import { GsxManager, GsxState, localGsxLocator, parseRemotePort, pushbackDirections } from "../apps/server/src/gsx";
import { ClientHub } from "../apps/server/src/hub";
import { createEfbServer, type EfbServer } from "../apps/server/src";
import { request, tmpDir } from "./helpers";

// A pino-shaped logger that accepts every level without printing; the real one comes from the
// server, but the manager only ever calls `.debug` on it.
const noop = () => undefined;
const silent = { level: "silent", debug: noop, info: noop, warn: noop, error: noop, fatal: noop, trace: noop, child: () => silent } as unknown as Logger;

/* ------------------------------------------------------------------ port discovery */

describe("GSX Remote API port discovery", () => {
  it("reads the port GSX wrote in its own Couatl config", () => {
    expect(parseRemotePort("[GSX]\nremote_server_port = 9001\n")).toBe(9001);
    expect(parseRemotePort("remote_server_port=8744")).toBe(8744);
    expect(parseRemotePort("REMOTE_SERVER_PORT = 1234")).toBe(1234);
  });

  it("returns null for a missing or nonsense value instead of guessing", () => {
    expect(parseRemotePort("[GSX]\nsomething_else = 1\n")).toBeNull();
    expect(parseRemotePort("remote_server_port =")).toBeNull();
    expect(parseRemotePort("remote_server_port = 99999")).toBeNull();
    expect(parseRemotePort("remote_server_port = abc")).toBeNull();
    expect(parseRemotePort("")).toBeNull();
  });

  it("reports GSX as not installed when this is not the simulator PC", () => {
    // Detection must never throw on a machine with no GSX at all (macOS/Linux/CI).
    const locator = localGsxLocator({});
    expect(() => locator.port()).not.toThrow();
    if (process.platform !== "win32") expect(locator.installed()).toBe(false);
  });

  it("still answers a port when GSX has never written its config", () => {
    const locator = localGsxLocator({});
    expect(locator.port()).toBe(8744);
  });
});

/* ---------------------------------------------------------------------- parsing */

const HELLO = {
  v: 1,
  type: "hello",
  ts: 1,
  protocol: 2,
  engine: "couatl",
  sim: "MSFS2024",
  gsxRunning: true,
  authRequired: false,
  capabilities: ["state", "services"],
};

const SNAPSHOT = {
  v: 1,
  type: "snapshot",
  ts: 2,
  state: 1,
  handlerData: {
    airport: { icao: "KJFK", name: "John F Kennedy Intl" },
    gate: {
      uiGateName: "A12",
      uiTerminalName: "A",
      pushback: 3,
      pushbackLabels: ["LEFT", "RIGHT"],
      pushbackAddPos: [{ label: "FORWARD" }],
      pushbackType: 2,
    },
    aircraft: { icaoType: "A320", isCargo: false },
  },
  services: [
    { id: "Boarding", stateRaw: 5, canTrigger: false, operator: "Beacon", progressText: "45/120" },
    { id: "Departure", stateRaw: 4, canTrigger: true, operator: "", progressText: null },
    { id: "Catering", stateRaw: 6, canTrigger: false, operator: "LSG", progressText: null },
  ],
};

describe("GSX message parsing", () => {
  it("folds a hello, snapshot and patch into a status", () => {
    const s = new GsxState();
    expect(s.apply(HELLO)).toBe(true);
    expect(s.handshakeComplete).toBe(true);

    expect(s.apply(SNAPSHOT)).toBe(true);
    const status = s.status("connected", null, 123);
    expect(status.gsxRunning).toBe(true);
    expect(status.sim).toBe("MSFS2024");
    expect(status.airport).toEqual({ icao: "KJFK", name: "John F Kennedy Intl" });
    expect(status.gate).toEqual({ name: "A12", terminal: "A" });
    expect(status.aircraft).toEqual({ icaoType: "A320", isCargo: false });
    expect(status.services.map((x) => x.id)).toEqual(["Boarding", "Catering", "Departure"]);
    expect(status.services.find((x) => x.id === "Boarding")).toEqual({
      id: "Boarding",
      stateRaw: 5,
      canTrigger: false,
      operator: "Beacon",
      progressText: "45/120",
    });
    expect(status.updatedAt).toBe(123);
  });

  it("applies a services patch without losing services it did not resend", () => {
    const s = new GsxState();
    s.apply(HELLO);
    s.apply(SNAPSHOT);
    // GSX replaces the whole list on every patch, so a shorter list really means "gone".
    expect(s.apply({ v: 1, type: "patch", ts: 3, path: "/services", value: [{ id: "Catering", stateRaw: 5, canTrigger: false }] })).toBe(true);
    expect(s.status("connected", null, null).services.map((x) => x.id)).toEqual(["Catering"]);
  });

  it("reports a change only when something visible actually changed", () => {
    const s = new GsxState();
    s.apply(HELLO);
    s.apply(SNAPSHOT);
    expect(s.apply(SNAPSHOT)).toBe(false);
    expect(s.apply({ v: 1, type: "patch", ts: 4, path: "/menu", value: { title: "x", entries: [] } })).toBe(false);
    expect(s.apply({ v: 1, type: "event", ts: 5, topic: "engine" })).toBe(false);
    expect(s.apply({ v: 1, type: "event", ts: 6, topic: "engine", gsxRunning: false })).toBe(true);
    expect(s.status("connected", null, null).gsxRunning).toBe(false);
  });

  it("ignores an API version it does not understand", () => {
    const s = new GsxState();
    expect(s.apply({ ...HELLO, v: 2 })).toBe(false);
    expect(s.handshakeComplete).toBe(false);
    expect(s.status("connected", null, null).protocol).toBeNull();
  });

  it("rejects a hello that is not a usable handshake", () => {
    const s = new GsxState();
    expect(s.apply({ ...HELLO, protocol: 0 })).toBe(false);
    expect(s.apply({ ...HELLO, engine: "" })).toBe(false);
    expect(s.apply({ ...HELLO, capabilities: [] })).toBe(false);
    expect(s.apply(null)).toBe(false);
    expect(s.apply("nonsense")).toBe(false);
    expect(s.handshakeComplete).toBe(false);
  });

  it("treats a snapshot without state as invalid", () => {
    const s = new GsxState();
    s.apply(HELLO);
    expect(s.apply({ v: 1, type: "snapshot", ts: 3 })).toBe(false);
    expect(s.snapshotReceived).toBe(false);
  });

  it("never crashes on missing or malformed service data", () => {
    const s = new GsxState();
    s.apply(HELLO);
    expect(s.apply({ v: 1, type: "snapshot", ts: 3, state: 1 })).toBe(true);
    expect(s.apply({ v: 1, type: "snapshot", ts: 4, state: 1, services: null })).toBe(false);
    expect(s.apply({ v: 1, type: "patch", ts: 5, path: "/services", value: [null, 7, "x", { id: "NotAService", stateRaw: 5 }] })).toBe(false);
    expect(s.apply({ v: 1, type: "patch", ts: 6, path: "/services", value: [{ id: "Boarding", stateRaw: 99 }] })).toBe(true);
    // An out-of-range state collapses to "unknown" rather than being trusted.
    expect(s.status("connected", null, null).services[0]?.stateRaw).toBe(0);
    expect(s.status("connected", null, null).services[0]?.progressText).toBeNull();
  });

  it("leaves every field null when GSX has sent nothing", () => {
    const s = new GsxState();
    const status = s.status("connecting", "Looking for GSX Pro.", null);
    expect(status).toEqual(emptyGsxStatus("connecting", "Looking for GSX Pro."));
    expect(GsxStatusSchema.safeParse(status).success).toBe(true);
  });

  it("only marks the subscribe result as subscribed once", () => {
    const s = new GsxState();
    s.apply(HELLO);
    expect(s.apply({ v: 1, type: "result", ts: 3, id: "subscribe", ok: true })).toBe(true);
    expect(s.apply({ v: 1, type: "result", ts: 4, id: "subscribe", ok: true })).toBe(false);
    expect(s.apply({ v: 1, type: "result", ts: 5, id: "subscribe", ok: false })).toBe(false);
  });
});

/* ------------------------------------------------------------------ pushback data */

describe("pushback information", () => {
  const gate = (over: Partial<ReturnType<typeof base>> = {}) => ({ ...base(), ...over });
  function base() {
    return { name: "A12", terminal: null, pushback: null as number | null, pushbackLabels: [] as string[], pushbackAddPos: [] as string[], pushbackType: null as number | null };
  }

  it("lists what the parking allows without claiming a selection", () => {
    expect(pushbackDirections(gate({ pushback: 1, pushbackLabels: ["LEFT", "RIGHT"] }))).toEqual(["LEFT"]);
    expect(pushbackDirections(gate({ pushback: 2, pushbackLabels: ["LEFT", "RIGHT"] }))).toEqual(["RIGHT"]);
    expect(pushbackDirections(gate({ pushback: 3, pushbackLabels: ["LEFT", "RIGHT"] }))).toEqual(["LEFT", "RIGHT"]);
    expect(pushbackDirections(gate({ pushback: 3, pushbackLabels: [], pushbackAddPos: ["FORWARD"] }))).toEqual([
      "FORWARD",
      "LEFT",
      "RIGHT",
    ]);
    expect(pushbackDirections(gate({ pushback: 0 }))).toEqual([]);
    expect(pushbackDirections(null)).toEqual([]);
  });
});

/* --------------------------------------------------------------- live connection */

describe("GSX connection", () => {
  let wss: WebSocketServer;
  let port: number;
  let received: string[];
  let clients: Set<WebSocket>;
  let snapshotOnConnect: unknown;
  const managers: GsxManager[] = [];

  beforeEach(async () => {
    received = [];
    clients = new Set();
    managers.length = 0;
    snapshotOnConnect = SNAPSHOT;
    wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    wss.on("connection", (socket) => {
      clients.add(socket);
      socket.on("close", () => clients.delete(socket));
      socket.on("message", (data) => received.push(data.toString()));
      socket.send(JSON.stringify(HELLO));
      const kick = setInterval(() => {
        if (received.some((m) => m.includes('"subscribe"'))) {
          clearInterval(kick);
          socket.send(JSON.stringify({ v: 1, type: "result", ts: 3, id: "subscribe", ok: true }));
          if (snapshotOnConnect) socket.send(JSON.stringify(snapshotOnConnect));
        }
      }, 5);
      kick.unref?.();
    });
    await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
    port = (wss.address() as { port: number }).port;
  });

  afterEach(async () => {
    await Promise.all(managers.map((m) => m.stop()));
    for (const c of clients) c.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });

  const manager = () => {
    const m = new GsxManager({
      hub: new ClientHub("test"),
      logger: silent,
      locator: { installed: () => true, port: () => port },
      stateRefreshMs: 50,
    });
    managers.push(m);
    return m;
  };

  async function waitFor(check: () => boolean, ms = 4000): Promise<void> {
    const start = Date.now();
    while (!check()) {
      if (Date.now() - start > ms) throw new Error("timed out waiting for GSX state");
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  it("connects, subscribes and mirrors the services GSX published", async () => {
    const m = manager();
    m.start();
    await waitFor(() => m.status().connection === "connected" && m.status().services.length === 3);
    const s = m.status();
    expect(s.gsxRunning).toBe(true);
    expect(s.sim).toBe("MSFS2024");
    expect(s.gate?.name).toBe("A12");
    expect(s.pushback?.directions).toEqual(["FORWARD", "LEFT", "RIGHT"]);
    expect(s.pushback?.tugType).toBe("towbarless");
    expect(received.some((msg) => msg.includes('"subscribe"'))).toBe(true);
    // Read-only: nothing but subscribe may ever be sent.
    expect(received.every((msg) => !msg.includes("service.trigger") && !msg.includes("settings.set") && !msg.includes("menu.pick"))).toBe(true);
    await m.stop();
  });

  it("asks GSX for its state when no snapshot ever arrived, and nothing else", async () => {
    snapshotOnConnect = null;
    const m = manager();
    m.start();
    await waitFor(() => received.some((msg) => msg.includes('"state.get"')));
    expect(received.every((msg) => !msg.includes("service.trigger") && !msg.includes("settings.set") && !msg.includes("menu.pick"))).toBe(true);
    await m.stop();
  });

  it("reports an unreachable GSX when the connection drops", async () => {
    const m = manager();
    m.start();
    await waitFor(() => m.status().connection === "connected" && m.status().services.length === 3);
    for (const c of clients) c.terminate();
    await waitFor(() => m.status().connection === "unreachable");
    const s = m.status();
    expect(s.services).toEqual([]); // stale data is dropped, never shown as current
    expect(s.updatedAt).toBeNull();
    expect(s.detail).toMatch(/GSX/);
    await m.stop();
  });

  it("stops retrying once the manager is stopped", async () => {
    const m = manager();
    m.start();
    await waitFor(() => m.status().connection === "connected" || m.status().connection === "unreachable");
    await m.stop();
    const after = received.length;
    await new Promise((r) => setTimeout(r, 120));
    expect(received.length).toBe(after);
    expect(m.status().connection).toBe("unreachable");
  });

  it("never attempts a connection when GSX is not installed", async () => {
    const m = new GsxManager({
      hub: new ClientHub("test"),
      logger: silent,
      locator: { installed: () => false, port: () => port },
    });
    managers.push(m);
    m.start();
    expect(m.status().connection).toBe("unavailable");
    await new Promise((r) => setTimeout(r, 80));
    expect(clients.size).toBe(0);
    await m.stop();
    expect(m.status().connection).toBe("unavailable");
  });
});

/* --------------------------------------------------------------------- HTTP API */

describe("GET /api/gsx", () => {
  let dataDir: string;
  let server: EfbServer;
  let port: number;

  beforeEach(async () => {
    dataDir = tmpDir();
    server = createEfbServer({
      dataDir,
      port: 0,
      version: "9.9.9",
      logToStdout: false,
      gsxLocator: { installed: () => false, port: () => 8744 },
    });
    port = (await server.start()).port;
  });

  afterEach(async () => {
    await server.dispose();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns a valid status and leaks no local path", async () => {
    const r = await request(port, "GET", "/api/gsx");
    expect(r.status).toBe(200);
    const parsed = GsxStatusSchema.safeParse(r.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.connection).toBe("unavailable");
    expect(parsed.data?.services).toEqual([]);
    expect(JSON.stringify(r.body)).not.toMatch(/AppData|Virtuali|Couatl|Program Files/);
  });

  it("keeps serving normally when GSX is absent", async () => {
    expect((await request(port, "GET", "/api/health")).status).toBe(200);
    expect((await request(port, "GET", "/api/telemetry")).status).toBe(200);
  });
});

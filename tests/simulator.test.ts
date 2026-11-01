import { afterEach, describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket as ServerSocket } from "ws";
import type { Telemetry } from "../packages/shared/src";
import { FsuipcWsAdapter, MockAdapter, SimConnectAdapter, comActiveMhz, convertRaw, looksLikeNoSimData, OFFSETS } from "../packages/simulator/src";

const TWO_32 = 2 ** 32;
const GOOD = { latitude: 25.25, longitude: 55.36, altitude: 3048 * TWO_32, groundSpeed: 100 * 65536, indicatedAirspeed: 250 * 128, heading: TWO_32 / 2, verticalSpeed: 5 * 256, outsideAirTemp: -54 * 256, onGround: 0 };

describe("FSUIPC raw value conversion", () => {
  it("converts documented scalings to internal units", () => {
    const v = convertRaw(GOOD);
    expect(v.latitudeDeg).toBe(25.25);
    expect(v.longitudeDeg).toBe(55.36);
    expect(v.altitudeFt).toBeCloseTo(10000, 0);
    expect(v.groundSpeedKt).toBeCloseTo(194.38, 1);
    expect(v.indicatedAirspeedKt).toBe(250);
    expect(v.headingTrueDeg).toBeCloseTo(180, 6);
    expect(v.verticalSpeedFpm).toBeCloseTo(984.25, 1);
    expect(v.outsideAirTempC).toBe(-54);
    expect(v.onGround).toBe(false);
    expect(v.trackTrueDeg).toBeNull();
  });
  it("handles negative vertical speed and on-ground", () => {
    const v = convertRaw({ ...GOOD, verticalSpeed: -10 * 256, onGround: 1 });
    expect(v.verticalSpeedFpm).toBeCloseTo(-1968.5, 1);
    expect(v.onGround).toBe(true);
  });
  it("marks missing, malformed and out-of-range values unavailable instead of inventing them", () => {
    const v = convertRaw({ latitude: 123, longitude: "abc", altitude: null, groundSpeed: NaN, indicatedAirspeed: {}, heading: -1, onGround: 7 });
    expect(Object.values(v).every((x) => x === null)).toBe(true);
  });
  it("accepts numeric strings", () => {
    expect(convertRaw({ indicatedAirspeed: "12800" }).indicatedAirspeedKt).toBe(100);
  });
  it("reads COM1/COM2 active frequencies from the Hz offsets, at kHz precision", () => {
    expect(comActiveMhz(118_900_000)).toBe(118.9);
    expect(comActiveMhz(118_025_000)).toBe(118.025); // 8.33 kHz channel
    expect(comActiveMhz("121700000")).toBe(121.7);
    const v = convertRaw({ ...GOOD, com1Active: 118_900_000, com2Active: 121_500_000 });
    expect(v.com1ActiveMhz).toBe(118.9);
    expect(v.com2ActiveMhz).toBe(121.5);
  });
  it("treats an unread, empty or out-of-band radio as unavailable", () => {
    expect(comActiveMhz(0)).toBeNull();
    expect(comActiveMhz(-1)).toBeNull();
    expect(comActiveMhz(null)).toBeNull();
    expect(comActiveMhz(undefined)).toBeNull();
    expect(comActiveMhz(Number.NaN)).toBeNull();
    expect(comActiveMhz(450_000_000)).toBeNull();
    expect(convertRaw(GOOD).com1ActiveMhz).toBeNull();
  });
  it("detects the all-zero 'simulator not loaded' reading", () => {
    expect(looksLikeNoSimData({ latitude: 0, longitude: 0, altitude: 0, groundSpeed: 0, indicatedAirspeed: 0 })).toBe(true);
    expect(looksLikeNoSimData(GOOD)).toBe(false);
    expect(looksLikeNoSimData({})).toBe(false);
  });
});

interface Fake {
  wss: WebSocketServer;
  port: number;
  received: any[];
  sockets: ServerSocket[];
  send: (obj: unknown) => void;
}

async function fakeFsuipc(respond: (msg: any, sock: ServerSocket, fake: Fake) => void = defaultRespond): Promise<Fake> {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1", handleProtocols: (p) => (p.has("fsuipc") ? "fsuipc" : false) });
  await new Promise((r) => wss.once("listening", r));
  const fake: Fake = { wss, port: (wss.address() as AddressInfo).port, received: [], sockets: [], send: (o) => fake.sockets.forEach((s) => s.send(JSON.stringify(o))) };
  wss.on("connection", (s) => {
    fake.sockets.push(s);
    s.on("message", (d) => {
      const msg = JSON.parse(d.toString());
      fake.received.push(msg);
      respond(msg, s, fake);
    });
  });
  return fake;
}
function defaultRespond(msg: any, s: ServerSocket) {
  if (msg.command === "offsets.declare") s.send(JSON.stringify({ command: msg.command, name: msg.name, success: true }));
  if (msg.command === "offsets.read") s.send(JSON.stringify({ command: msg.command, name: msg.name, success: true, data: GOOD }));
}
async function until(cond: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 15));
  }
}

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const c of cleanup.splice(0)) await c();
});
const closeFake = (f: Fake) => () => new Promise<void>((r) => { f.sockets.forEach((s) => s.terminate()); f.wss.close(() => r()); });

describe("FsuipcWsAdapter", () => {
  it("declares the documented offsets, reads at the configured interval and publishes converted telemetry", async () => {
    const fake = await fakeFsuipc();
    cleanup.push(closeFake(fake));
    const a = new FsuipcWsAdapter({ port: fake.port, rateHz: 4, reconnectMinMs: 20 });
    cleanup.push(() => a.disconnect());
    const seen: string[] = [];
    a.subscribeToTelemetry((t) => seen.push(t.status));
    await a.connect();
    await until(() => a.getStatus() === "connected" && a.getTelemetrySnapshot().updatedAt !== null);

    const declare = fake.received.find((m) => m.command === "offsets.declare");
    expect(declare.offsets).toEqual(OFFSETS.map((o) => ({ ...o })));
    expect(fake.received.find((m) => m.command === "offsets.read")).toMatchObject({ name: declare.name, interval: 250 });
    const t = a.getTelemetrySnapshot();
    expect(t.source).toBe("fsuipc");
    expect(t.values.indicatedAirspeedKt).toBe(250);
    expect(t.values.altitudeFt).toBeCloseTo(10000, 0);
    expect(seen).toContain("connecting");
  });

  it("reports disconnected with no values when nothing is listening, then recovers when the server appears", async () => {
    const probe = await fakeFsuipc();
    const port = probe.port;
    await closeFake(probe)();
    const a = new FsuipcWsAdapter({ port, rateHz: 10, reconnectMinMs: 20, reconnectMaxMs: 40 });
    cleanup.push(() => a.disconnect());
    await a.connect();
    await until(() => a.getStatus() === "disconnected");
    expect(a.getTelemetrySnapshot().values.latitudeDeg).toBeNull();
    expect(a.getTelemetrySnapshot().detail).toMatch(/FSUIPC/);

    const wss = new WebSocketServer({ port, host: "127.0.0.1", handleProtocols: (p) => (p.has("fsuipc") ? "fsuipc" : false) });
    cleanup.push(() => new Promise<void>((r) => { wss.clients.forEach((c) => c.terminate()); wss.close(() => r()); }));
    wss.on("connection", (s) => s.on("message", (d) => defaultRespond(JSON.parse(d.toString()), s as unknown as ServerSocket)));
    await until(() => a.getStatus() === "connected" && a.getTelemetrySnapshot().updatedAt !== null);
    expect(a.getTelemetrySnapshot().values.indicatedAirspeedKt).toBe(250);
  });

  it("clears values on connection loss, keeps the last-update time, and reconnects", async () => {
    const fake = await fakeFsuipc();
    cleanup.push(closeFake(fake));
    const a = new FsuipcWsAdapter({ port: fake.port, rateHz: 10, reconnectMinMs: 20 });
    cleanup.push(() => a.disconnect());
    await a.connect();
    await until(() => a.getTelemetrySnapshot().updatedAt !== null);
    const firstUpdate = a.getTelemetrySnapshot().updatedAt;
    fake.sockets.forEach((s) => s.terminate());
    await until(() => a.getStatus() !== "connected");
    const lost = a.getTelemetrySnapshot();
    expect(lost.values.altitudeFt).toBeNull();
    expect(lost.updatedAt).toBe(firstUpdate);
    await until(() => a.getStatus() === "connected" && (a.getTelemetrySnapshot().updatedAt ?? 0) >= (firstUpdate ?? 0) && a.getTelemetrySnapshot().values.altitudeFt !== null);
  });

  it("shows 'waiting for simulator' and no values when FSUIPC returns all zeros", async () => {
    const zeros = { latitude: 0, longitude: 0, altitude: 0, groundSpeed: 0, indicatedAirspeed: 0, heading: 0, verticalSpeed: 0, outsideAirTemp: 0, onGround: 0 };
    const fake = await fakeFsuipc((msg, s) => {
      if (msg.command === "offsets.declare") s.send(JSON.stringify({ command: msg.command, name: msg.name, success: true }));
      if (msg.command === "offsets.read") s.send(JSON.stringify({ command: msg.command, name: msg.name, success: true, data: zeros }));
    });
    cleanup.push(closeFake(fake));
    const a = new FsuipcWsAdapter({ port: fake.port, rateHz: 10 });
    cleanup.push(() => a.disconnect());
    await a.connect();
    await until(() => a.getStatus() === "connected");
    await until(() => /Waiting/.test(a.getTelemetrySnapshot().detail ?? ""));
    const t = a.getTelemetrySnapshot();
    expect(t.updatedAt).toBeNull();
    expect(Object.values(t.values).every((v) => v === null)).toBe(true);
  });

  it("drops the link and reports the reason when FSUIPC returns an error", async () => {
    const fake = await fakeFsuipc((msg, s) => {
      if (msg.command === "offsets.declare") s.send(JSON.stringify({ command: msg.command, name: msg.name, success: false, errorCode: 7, errorMessage: "bad offset" }));
    });
    cleanup.push(closeFake(fake));
    const a = new FsuipcWsAdapter({ port: fake.port, rateHz: 10, reconnectMinMs: 500 });
    cleanup.push(() => a.disconnect());
    await a.connect();
    await until(() => /bad offset/.test(a.getTelemetrySnapshot().detail ?? ""));
    expect(a.getStatus()).toBe("disconnected");
  });

  it("reconnects when data stops arriving (watchdog)", async () => {
    let reads = 0;
    const fake = await fakeFsuipc((msg, s) => {
      if (msg.command === "offsets.declare") s.send(JSON.stringify({ command: msg.command, name: msg.name, success: true }));
      if (msg.command === "offsets.read" && ++reads === 1) s.send(JSON.stringify({ command: msg.command, name: msg.name, success: true, data: GOOD }));
    });
    cleanup.push(closeFake(fake));
    const a = new FsuipcWsAdapter({ port: fake.port, rateHz: 10, reconnectMinMs: 20, staleAfterMs: 1200 });
    cleanup.push(() => a.disconnect());
    await a.connect();
    await until(() => reads >= 2, 6000);
  });

  it("stops cleanly and does not reconnect after disconnect()", async () => {
    const fake = await fakeFsuipc();
    cleanup.push(closeFake(fake));
    const a = new FsuipcWsAdapter({ port: fake.port, rateHz: 10, reconnectMinMs: 20 });
    await a.connect();
    await until(() => a.getStatus() === "connected");
    await a.disconnect();
    const n = fake.received.length;
    await new Promise((r) => setTimeout(r, 200));
    expect(a.getStatus()).toBe("disconnected");
    expect(fake.sockets.length).toBe(1);
    expect(fake.received.length).toBe(n);
  });
});

describe("MockAdapter", () => {
  it("is always labelled as the mock source", async () => {
    const m = new MockAdapter(20);
    cleanup.push(() => m.disconnect());
    await m.connect();
    const t = m.getTelemetrySnapshot();
    expect(t.source).toBe("mock");
    expect(t.detail).toMatch(/SIMULATED/);
  });
});

/** A stand-in for the SimConnect handle: records what the adapter asked for and can emit samples. */
class FakeHandle extends EventEmitter {
  definitions: unknown[][] = [];
  requests: unknown[][] = [];
  closed = false;
  addToDataDefinition(...args: unknown[]): number {
    this.definitions.push(args);
    return 1;
  }
  requestDataOnSimObject(...args: unknown[]): number {
    this.requests.push(args);
    return 1;
  }
  close(): void {
    this.closed = true;
  }
}

/** Reads values in the fixed order the adapter defines them. */
function reader(values: number[]): { readFloat64: () => number; readInt32: () => number } {
  let i = 0;
  return {
    readFloat64: () => values[i++] ?? Number.NaN,
    readInt32: () => values[i++] ?? 0,
  };
}

/** lat, lon, alt, gs, ias, hdg, vs, oat, onGround, com1, com2 */
const SAMPLE = [25.25, 55.36, 12_000, 250, 240, 270, 1_500, -40, 0, 118.9, 121.5];

describe("SimConnectAdapter", () => {
  it("defines the MSFS variables in order, requests them every frame and publishes the sample", async () => {
    const handle = new FakeHandle();
    const a = new SimConnectAdapter({ rateHz: 10, connect: async () => ({ handle }) });
    cleanup.push(() => a.disconnect());
    await a.connect();
    await until(() => a.getStatus() === "connected");

    expect(handle.definitions.map((d) => d[1])).toEqual([
      "PLANE LATITUDE",
      "PLANE LONGITUDE",
      "PLANE ALTITUDE",
      "GROUND SPEED",
      "AIRSPEED INDICATED",
      "PLANE HEADING DEGREES TRUE",
      "VERTICAL SPEED",
      "AMBIENT TEMPERATURE",
      "SIM ON GROUND",
      "COM ACTIVE FREQUENCY:1",
      "COM ACTIVE FREQUENCY:2",
    ]);
    // request id, definition id, user object, period — nothing is ever written to the simulator.
    expect(handle.requests).toEqual([[0, 0, expect.any(Number), 2]]);

    handle.emit("simObjectData", { requestID: 0, data: reader(SAMPLE) });
    const t = a.getTelemetrySnapshot();
    expect(t.source).toBe("simconnect");
    expect(t.status).toBe("connected");
    expect(t.values.latitudeDeg).toBe(25.25);
    expect(t.values.altitudeFt).toBe(12_000);
    expect(t.values.groundSpeedKt).toBe(250);
    expect(t.values.headingTrueDeg).toBe(270);
    expect(t.values.onGround).toBe(false);
    expect(t.values.com1ActiveMhz).toBe(118.9);
    expect(t.values.com2ActiveMhz).toBe(121.5);
  });

  it("shows a wait, not 0/0 coordinates, before a flight is loaded", async () => {
    const handle = new FakeHandle();
    let clock = 10_000;
    const a = new SimConnectAdapter({ rateHz: 10, now: () => clock, connect: async () => ({ handle }) });
    cleanup.push(() => a.disconnect());
    await a.connect();
    await until(() => a.getStatus() === "connected");

    handle.emit("simObjectData", { requestID: 0, data: reader(SAMPLE) });
    clock += 1_000; // outside the configured rate, so the empty reading really is applied
    handle.emit("simObjectData", { requestID: 0, data: reader([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]) });
    const t = a.getTelemetrySnapshot();
    expect(t.status).toBe("connected");
    expect(t.detail).toMatch(/Waiting for the simulator/);
    expect(t.values.latitudeDeg).toBeNull(); // the previous position is dropped, not left on screen
    expect(t.values.altitudeFt).toBeNull();
  });

  it("drops samples that arrive faster than the configured rate", async () => {
    const handle = new FakeHandle();
    let clock = 1_000;
    const a = new SimConnectAdapter({ rateHz: 1, now: () => clock, connect: async () => ({ handle }) });
    cleanup.push(() => a.disconnect());
    await a.connect();
    await until(() => a.getStatus() === "connected");

    handle.emit("simObjectData", { requestID: 0, data: reader(SAMPLE) });
    expect(a.getTelemetrySnapshot().values.latitudeDeg).toBe(25.25);

    clock += 100; // well inside the 1000 ms the rate allows
    handle.emit("simObjectData", { requestID: 0, data: reader([1, 2, 3, 4, 5, 6, 7, 8, 1, 9, 10]) });
    expect(a.getTelemetrySnapshot().values.latitudeDeg).toBe(25.25);
  });

  it("reports the failure, retries, and reconnects when the simulator quits", async () => {
    const handle = new FakeHandle();
    let calls = 0;
    const a = new SimConnectAdapter({
      rateHz: 5,
      reconnectMinMs: 60,
      connect: async () => {
        calls++;
        if (calls === 1) throw new Error("no simulator running");
        return { handle };
      },
    });
    cleanup.push(() => a.disconnect());
    await a.connect();
    await until(() => calls >= 2);
    expect(a.getStatus()).toBe("connected");

    handle.emit("quit");
    await until(() => handle.closed && a.getStatus() === "disconnected");
    expect(a.getTelemetrySnapshot().values.latitudeDeg).toBeNull();

    await until(() => calls >= 3);
    expect(a.getStatus()).toBe("connected");
  });

  it("stops cleanly and does not reconnect after disconnect()", async () => {
    const handle = new FakeHandle();
    let calls = 0;
    const a = new SimConnectAdapter({
      rateHz: 5,
      reconnectMinMs: 10,
      connect: async () => {
        calls++;
        if (calls === 1) throw new Error("no simulator running");
        return { handle };
      },
    });
    await a.connect();
    await until(() => calls >= 2 && a.getStatus() === "connected");
    await a.disconnect();
    const after = calls;
    await new Promise((r) => setTimeout(r, 150));
    expect(calls).toBe(after);
    expect(a.getStatus()).toBe("disconnected");
    const t: Telemetry = a.getTelemetrySnapshot();
    expect(t.source).toBe("simconnect");
    expect(t.values.latitudeDeg).toBeNull();
  });
});
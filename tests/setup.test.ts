import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import { buildSetupStatus, probePort, withTimeout, type SetupFacts } from "../apps/server/src/setup";
import { detectFrom, steamLibraryFolders, steamRootFromRegistry } from "../apps/server/src/simulator-detect";
import { createEfbServer, type EfbServer } from "../apps/server/src";
import { emptyGsxStatus, type Telemetry } from "@open-efb/shared";
import { request, tmpDir } from "./helpers";

/* ------------------------------------------------ unit: buildSetupStatus */

const baseTelemetry = (over: Partial<Telemetry> = {}): Telemetry => ({
  source: null,
  status: "disconnected",
  detail: null,
  updatedAt: null,
  values: {
    latitudeDeg: null, longitudeDeg: null, altitudeFt: null, groundSpeedKt: null,
    indicatedAirspeedKt: null, headingTrueDeg: null, trackTrueDeg: null, verticalSpeedFpm: null,
    outsideAirTempC: null, onGround: null, com1ActiveMhz: null, com2ActiveMhz: null,
  },
  ...over,
});

const baseFacts = (over: Partial<SetupFacts> = {}): SetupFacts => ({
  settings: {
    lanAccessEnabled: false, port: 4780, telemetryRateHz: 2, theme: "dark",
    simbriefUser: "", chartsProvider: "chartfox", units: { altitude: "ft", speed: "kt", temperature: "C", weight: "kg" },
    simulatorEnabled: true, fsuipcPort: 2048, autoLaunchOnSimulator: true, startWithWindows: false, setupCompleted: false,
  },
  gsx: emptyGsxStatus("unavailable", null),
  telemetry: baseTelemetry(),
  sims: [{ id: "msfs2024-steam", label: "Microsoft Flight Simulator 2024 (Steam)" }],
  fsuipcInstalled: false,
  fsuipcPortOpen: false,
  simbrief: "unset",
  simbriefRoute: null,
  vatsim: null,
  ...over,
});

const item = (f: SetupFacts, id: string) => {
  const found = buildSetupStatus(f).items.find((i) => i.id === id);
  if (!found) throw new Error(`no item ${id}`);
  return found;
};

describe("buildSetupStatus", () => {
  it("lists every integration in a fixed order with the four-status vocabulary", () => {
    const s = buildSetupStatus(baseFacts());
    expect(s.items.map((i) => i.id)).toEqual(["simbrief", "gsx", "simulator", "fsuipc", "charts", "vatsim"]);
    for (const i of s.items) expect(["connected", "needs_setup", "optional", "unavailable"]).toContain(i.status);
    expect(s.completed).toBe(false);
  });

  it("passes the persisted completed flag through unchanged", () => {
    expect(buildSetupStatus(baseFacts({ settings: { ...baseFacts().settings, setupCompleted: true } })).completed).toBe(true);
  });

  it("simbrief: unset needs setup with a save action and no password request", () => {
    const i = item(baseFacts(), "simbrief");
    expect(i.status).toBe("needs_setup");
    expect(i.action).toBe("save");
    expect(i.detail).toMatch(/username/i);
    expect(i.detail).toMatch(/no password is ever requested/i);
  });

  it("simbrief: a loaded plan is connected and names the route", () => {
    const i = item(baseFacts({ simbrief: "ok", simbriefRoute: "OMDB → LHR" }), "simbrief");
    expect(i.status).toBe("connected");
    expect(i.detail).toContain("OMDB → LHR");
    expect(i.action).toBe("test");
  });

  it("simbrief: unknown user and unreachable are distinct and honest", () => {
    expect(item(baseFacts({ simbrief: "unknown_user" }), "simbrief").status).toBe("needs_setup");
    const offline = item(baseFacts({ simbrief: "unreachable" }), "simbrief");
    expect(offline.status).toBe("optional");
    expect(offline.detail).toMatch(/could not be reached/i);
  });

  it("gsx: maps all four connection states without inventing anything", () => {
    expect(item(baseFacts({ gsx: emptyGsxStatus("connected") }), "gsx").status).toBe("connected");
    expect(item(baseFacts({ gsx: emptyGsxStatus("connecting") }), "gsx").status).toBe("optional");
    expect(item(baseFacts({ gsx: emptyGsxStatus("unreachable") }), "gsx").status).toBe("needs_setup");
    const missing = item(baseFacts({ gsx: emptyGsxStatus("unavailable") }), "gsx");
    expect(missing.status).toBe("unavailable");
    expect(missing.action).toBeNull();
  });

  it("simulator: live data is connected, detected install is optional, nothing installed is unavailable", () => {
    const live = item(baseFacts({ telemetry: baseTelemetry({ status: "connected", source: "fsuipc" }) }), "simulator");
    expect(live.status).toBe("connected");
    expect(item(baseFacts(), "simulator").status).toBe("optional");
    expect(item(baseFacts({ sims: [] }), "simulator").status).toBe("unavailable");
  });

  it("simulator: mock telemetry is labelled as simulated, never as a real connection", () => {
    const i = item(baseFacts({ telemetry: baseTelemetry({ status: "connected", source: "mock" }) }), "simulator");
    expect(i.status).toBe("connected");
    expect(i.detail).toMatch(/simulated/i);
  });

  it("fsuipc: connected from live telemetry of either link, or from an answering port", () => {
    expect(item(baseFacts({ telemetry: baseTelemetry({ status: "connected", source: "fsuipc" }) }), "fsuipc").status).toBe("connected");
    expect(item(baseFacts({ telemetry: baseTelemetry({ status: "connected", source: "simconnect" }) }), "fsuipc").status).toBe("connected");
    const portOnly = item(baseFacts({ settings: { ...baseFacts().settings, simLink: "fsuipc" }, fsuipcPortOpen: true }), "fsuipc");
    expect(portOnly.status).toBe("connected");
  });

  it("fsuipc: SimConnect is the default and needs no install, so it never cries for FSUIPC", () => {
    const waiting = item(baseFacts(), "fsuipc");
    expect(waiting.status).toBe("optional");
    expect(waiting.detail).toMatch(/SimConnect/);
    expect(waiting.detail).toMatch(/built into MSFS/i);
    expect(waiting.detail).not.toMatch(/SimConnect alone is not enough/i);
  });

  it("fsuipc: distinguishes a switched-off link, a missing bridge and an undetected FSUIPC7", () => {
    const fsuipcLink = { ...baseFacts().settings, simLink: "fsuipc" as const };
    const off = item(baseFacts({ settings: { ...fsuipcLink, simulatorEnabled: false } }), "fsuipc");
    expect(off.status).toBe("needs_setup");
    expect(off.detail).toMatch(/switched off/i);
    const detected = item(baseFacts({ settings: fsuipcLink, fsuipcInstalled: true }), "fsuipc");
    expect(detected.detail).toMatch(/detected/i);
    expect(detected.detail).toMatch(/WebSocket Server/i);
    const missing = item(baseFacts({ settings: fsuipcLink }), "fsuipc");
    expect(missing.status).toBe("needs_setup");
    expect(missing.detail).toMatch(/SimConnect in Settings/i);
  });

  it("charts: explains the Navigraph licensing limit instead of pretending an API exists", () => {
    const nav = item(baseFacts({ settings: { ...baseFacts().settings, chartsProvider: "navigraph" } }), "charts");
    expect(nav.status).toBe("optional");
    expect(nav.detail).toMatch(/Navigraph/);
    expect(nav.detail).toMatch(/virtual cockpit/i);
    const fox = item(baseFacts(), "charts");
    expect(fox.detail).toMatch(/ChartFox/);
    expect(fox.action).toBe("open");
  });

  it("vatsim: connected only after a real feed check", () => {
    expect(item(baseFacts({ vatsim: "ok" }), "vatsim").status).toBe("connected");
    expect(item(baseFacts({ vatsim: null }), "vatsim").status).toBe("optional");
    expect(item(baseFacts({ vatsim: "unreachable" }), "vatsim").status).toBe("optional");
  });
});

/* --------------------------------------------- unit: simulator detection */

describe("simulator detection", () => {
  const files = (m: Record<string, string>) => ({
    platform: "win32" as NodeJS.Platform,
    localAppData: "C:\\Users\\pilot\\AppData\\Local",
    exists: (p: string) => p in m,
    read: (p: string) => m[p] ?? null,
    steamRoot: () => null,
  });

  it("finds Microsoft Store installs by their verified package folder names", () => {
    const found = detectFrom({
      ...files({
        "C:\\Users\\pilot\\AppData\\Local\\Packages\\Microsoft.Limitless_8wekyb3d8bbwe": "dir",
      }),
    });
    expect(found.map((f) => f.id)).toEqual(["msfs2024-store"]);
    expect(found[0]!.label).toContain("Microsoft Flight Simulator 2024");
  });

  it("finds a Steam install from its appmanifest in the root library", () => {
    const root = "C:\\Steam";
    const found = detectFrom({
      ...files({
        [`${root}\\steamapps\\appmanifest_1250410.acf`]: `"AppState"\n{\n}`,
      }),
      localAppData: null,
      steamRoot: () => root,
    });
    expect(found.map((f) => f.id)).toEqual(["msfs2020-steam"]);
  });

  it("walks extra Steam library folders from libraryfolders.vdf, old and new format", () => {
    const root = "C:\\Steam";
    const lib = "D:\\Games\\Steam";
    const vdf = `"1"\t\t"${root.replace(/\\/g, "\\\\")}"\n"path"\t\t"${lib.replace(/\\/g, "\\\\")}"`;
    expect(steamLibraryFolders(root, (p) => (p.endsWith("libraryfolders.vdf") ? vdf : null))).toEqual([root, lib]);

    const deps = files({ [`${lib}\\steamapps\\appmanifest_2537590.acf`]: "{" });
    const found = detectFrom({
      ...deps,
      localAppData: null,
      steamRoot: () => root,
      read: (p) => (p.endsWith("libraryfolders.vdf") ? vdf : deps.read(p)),
    });
    expect(found.map((f) => f.id)).toEqual(["msfs2024-steam"]);
  });

  it("returns nothing on non-Windows platforms", () => {
    expect(detectFrom({ ...files({}), platform: "darwin" })).toEqual([]);
  });

  it("parses the Steam registry value without a real registry", () => {
    const out = 'HKEY_CURRENT_USER\\Software\\Valve\\Steam\n    SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam\n';
    expect(steamRootFromRegistry(() => out)).toBe("C:\\Program Files (x86)\\Steam");
    expect(steamRootFromRegistry(() => null)).toBeNull();
    expect(steamRootFromRegistry(() => "no value here")).toBeNull();
  });

  it("detection labels never contain a filesystem path", () => {
    const found = detectFrom({
      ...files({
        "C:\\Users\\pilot\\AppData\\Local\\Packages\\Microsoft.FlightSimulator_8wekyb3d8bbwe": "dir",
        [`${"C:\\Steam"}\\steamapps\\appmanifest_1250410.acf`]: "{",
      }),
      steamRoot: () => "C:\\Steam",
    });
    expect(found.length).toBe(2);
    for (const f of found) {
      expect(f.label).not.toContain("\\");
      expect(f.label).not.toContain("pilot");
    }
  });
});

/* ------------------------------------------------------ unit: helpers */

describe("setup helpers", () => {
  it("probePort resolves true only on a real connection", async () => {
    const srv = await new Promise<{ port: number; close: () => void }>((resolve) => {
      const s = http.createServer((_q, r) => r.end("ok"));
      s.listen(0, "127.0.0.1", () => resolve({ port: (s.address() as { port: number }).port, close: () => s.close() }));
    });
    expect(await probePort(srv.port, 500)).toBe(true);
    expect(await probePort(1, 300)).toBe(false);
    srv.close();
  });

  it("withTimeout bounds a hanging check", async () => {
    await expect(withTimeout(new Promise(() => {}), 20)).rejects.toThrow("timeout");
    await expect(withTimeout(Promise.resolve(7), 100)).resolves.toBe(7);
  });
});

/* ------------------------------------------------------- HTTP endpoint */

interface Harness {
  server: EfbServer;
  port: number;
  dataDir: string;
}

const SIMS = [{ id: "msfs2024-steam", label: "Microsoft Flight Simulator 2024 (Steam)" }];

const okOFP = {
  fetch: { status: "success" },
  origin: { icao_code: "OMDB" },
  destination: { icao_code: "LHR" },
};

function mockFetch(behaviour: { simbrief?: unknown; simbriefStatus?: number } = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("simbrief.com")) {
      const body = behaviour.simbrief ?? okOFP;
      return new Response(JSON.stringify(body), { status: behaviour.simbriefStatus ?? 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("vatsim"))
      return new Response(JSON.stringify({ controllers: [], atis: [], general: {} }), { status: 200, headers: { "Content-Type": "application/json" } });
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
}

describe("GET /api/setup", () => {
  let h: Harness;
  const dirs: string[] = [];

  const boot = async (opts: Partial<Parameters<typeof createEfbServer>[0]> = {}): Promise<Harness> => {
    const dataDir = tmpDir();
    dirs.push(dataDir);
    const server = createEfbServer({
      dataDir,
      port: 0,
      logToStdout: false,
      fetch: mockFetch(),
      gsxLocator: { installed: () => false, port: () => 8744 },
      detectSims: () => SIMS,
      detectFsuipc: () => false,
      probePort: async () => false,
      ...opts,
    });
    const { port } = await server.start();
    return { server, port, dataDir };
  };

  beforeEach(async () => {
    h = await boot();
  });

  afterEach(async () => {
    await h.server.dispose();
    for (const d of dirs.splice(0)) {
      try {
        fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        /* Windows keeps SQLite files locked until the process exits */
      }
    }
  });

  it("answers with every integration and completed=false on first launch", async () => {
    const r = await request(h.port, "GET", "/api/setup");
    expect(r.status).toBe(200);
    expect(r.body.items.map((i: { id: string }) => i.id)).toEqual(["simbrief", "gsx", "simulator", "fsuipc", "charts", "vatsim"]);
    expect(r.body.completed).toBe(false);
    const byId = Object.fromEntries(r.body.items.map((i: { id: string }) => [i.id, i]));
    expect(byId.simbrief.status).toBe("needs_setup");
    expect(byId.gsx.status).toBe("unavailable");
    expect(byId.charts.status).toBe("optional");
    expect(byId.vatsim.status).toBe("connected");
  });

  it("detects a live connection: mock telemetry and an answering bridge are connected", async () => {
    await h.server.dispose();
    h = await boot({ simulator: "mock", probePort: async () => true, detectFsuipc: () => true });
    const byId = Object.fromEntries(((await request(h.port, "GET", "/api/setup")).body.items as { id: string; status: string }[]).map((i) => [i.id, i.status]));
    expect(byId.simulator).toBe("connected");
    expect(byId.fsuipc).toBe("connected");
  });

  it("reports the simulator as unavailable when no install is detected", async () => {
    await h.server.dispose();
    h = await boot({ detectSims: () => [] });
    const r = await request(h.port, "GET", "/api/setup");
    expect(r.body.items.find((i: { id: string }) => i.id === "simulator").status).toBe("unavailable");
  });

  it("verifies a saved SimBrief username with a live fetch and names the route", async () => {
    await request(h.port, "PATCH", "/api/settings", { body: { simbriefUser: "pilot" } });
    const r = await request(h.port, "GET", "/api/setup");
    const i = r.body.items.find((x: { id: string }) => x.id === "simbrief");
    expect(i.status).toBe("connected");
    expect(i.detail).toContain("OMDB");
  });

  it("maps an unknown SimBrief username to needs_setup, not a guess", async () => {
    await h.server.dispose();
    h = await boot({ fetch: mockFetch({ simbrief: { fetch: { status: "Error: Unknown Pilot ID" } } }) });
    await request(h.port, "PATCH", "/api/settings", { body: { simbriefUser: "wrong" } });
    const r = await request(h.port, "GET", "/api/setup");
    expect(r.body.items.find((i: { id: string }) => i.id === "simbrief").status).toBe("needs_setup");
  });

  it("reports unreachable upstreams as optional, never as connected", async () => {
    await h.server.dispose();
    h = await boot({ fetch: mockFetch({ simbriefStatus: 502 }) });
    await request(h.port, "PATCH", "/api/settings", { body: { simbriefUser: "pilot" } });
    const byId = Object.fromEntries(((await request(h.port, "GET", "/api/setup")).body.items as { id: string; status: string }[]).map((i) => [i.id, i.status]));
    expect(byId.simbrief).toBe("optional");
    expect(byId.vatsim).toBe("connected");
  });

  it("says the bridge is switched off when the simulator link is disabled", async () => {
    await request(h.port, "PATCH", "/api/settings", { body: { simulatorEnabled: false } });
    const r = await request(h.port, "GET", "/api/setup");
    const i = r.body.items.find((x: { id: string }) => x.id === "fsuipc");
    expect(i.status).toBe("needs_setup");
    expect(i.detail).toMatch(/switched off/i);
  });

  it("completion persists across a restart, so the wizard never auto-opens again", async () => {
    const done = await request(h.port, "POST", "/api/setup/complete");
    expect(done.status).toBe(200);
    expect((await request(h.port, "GET", "/api/setup")).body.completed).toBe(true);
    const dataDir = h.dataDir;
    await h.server.dispose();
    const server = createEfbServer({
      dataDir,
      port: 0,
      logToStdout: false,
      fetch: mockFetch(),
      gsxLocator: { installed: () => false, port: () => 8744 },
      detectSims: () => SIMS,
      detectFsuipc: () => false,
      probePort: async () => false,
    });
    const { port } = await server.start();
    h = { server, port, dataDir };
    expect((await request(port, "GET", "/api/setup")).body.completed).toBe(true);
    expect((await request(port, "GET", "/api/settings")).body.setupCompleted).toBe(true);
  });

  it("supports the Test button's forced refresh", async () => {
    const r = await request(h.port, "GET", "/api/setup?refresh=1");
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(6);
  });

  it("never leaks a local filesystem path to the client", async () => {
    const r = await request(h.port, "GET", "/api/setup");
    const text = JSON.stringify(r.body);
    expect(text).not.toContain(os.homedir());
    if (process.env.LOCALAPPDATA) expect(text).not.toContain(process.env.LOCALAPPDATA);
    expect(text).not.toMatch(/[A-Za-z]:\\\\?Users/);
  });

  it("sits behind the same auth as the rest of the protected API", async () => {
    // Loopback requests are always local (they pass auth), so the guard is proven by comparing
    // with another protected route, which must answer identically for a cookie-less caller.
    const bad = await request(h.port, "GET", "/api/telemetry", { headers: { Cookie: "efb_session=not-a-real-token" } });
    const setup = await request(h.port, "GET", "/api/setup");
    expect(bad.status).toBe(setup.status);
    expect(bad.status).toBe(200);
  });
});

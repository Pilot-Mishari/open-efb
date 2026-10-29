import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { matchListenStation, tuneKey, type VatsimSnapshot } from "../packages/integrations/src";
import {
  CABIN_ATC_PATH,
  CABIN_BROWSER_PATH,
  desiredCabinRoute,
  freqPairKey,
  isWatchedPath,
  mhzKey,
} from "../apps/web/src/lib/cabin-radio";
import { createEfbServer, type EfbServer } from "../apps/server/src";
import { request, tmpDir } from "./helpers";

/** Minimal VATSIM snapshot: [callsign, frequency, position]. */
const snap = (rows: [string, string, string][]): VatsimSnapshot => ({
  updatedAt: "2026-10-26T10:00:00Z",
  controllers: rows.map(([callsign, frequency, position]) => ({
    callsign,
    name: "Test Controller",
    frequency,
    position,
    onlineSince: "2026-10-26T09:00:00Z",
  })),
  atis: [],
  flights: [],
});

const ONLINE = snap([
  ["EDDF_TWR", "118.900", "Tower"],
  ["EDDF_GND", "121.700", "Ground"],
  ["EDDF_APP", "119.900", "Approach"],
]);

describe("tuneKey", () => {
  it("normalizes tuned frequencies to the feed's three-decimal form", () => {
    expect(tuneKey(118.9)).toBe("118.900");
    expect(tuneKey(118.9004)).toBe("118.900");
    expect(tuneKey(132.675)).toBe("132.675");
    expect(tuneKey(118.025)).toBe("118.025"); // 8.33 kHz channel
  });

  it("rejects missing, non-numeric and out-of-band readings", () => {
    expect(tuneKey(null)).toBeNull();
    expect(tuneKey(undefined)).toBeNull();
    expect(tuneKey(Number.NaN)).toBeNull();
    expect(tuneKey(100.5)).toBeNull();
    expect(tuneKey(225.0)).toBeNull();
    expect(tuneKey(137.5)).toBeNull();
  });
});

describe("matchListenStation", () => {
  it("never guesses when no usable frequency is tuned", () => {
    expect(matchListenStation(ONLINE, { com1: null, com2: null }).status).toBe("no_frequency");
    expect(matchListenStation(ONLINE, { com1: 100.5, com2: 225.0 }).status).toBe("no_frequency");
  });

  it("opens the single controller online on the tuned frequency", () => {
    const d = matchListenStation(ONLINE, { com1: 118.9, com2: null });
    expect(d).toMatchObject({
      status: "ok",
      radio: "COM1",
      station: "EDDF_TWR",
      frequency: "118.900",
      position: "Tower",
      com1: "118.900",
      com2: null,
      stale: false,
    });
    expect(d.candidates).toEqual([]);
  });

  it("falls back to COM2 when COM1 has nobody online", () => {
    const d = matchListenStation(ONLINE, { com1: 121.5, com2: 118.9 });
    expect(d.status).toBe("ok");
    expect(d.radio).toBe("COM2");
    expect(d.station).toBe("EDDF_TWR");
  });

  it("follows COM1 when both radios have a match (documented receive-selection fallback)", () => {
    const d = matchListenStation(ONLINE, { com1: 118.9, com2: 121.7 });
    expect(d).toMatchObject({ status: "ok", radio: "COM1", station: "EDDF_TWR" });
  });

  it("accepts the same station tuned on both radios", () => {
    const d = matchListenStation(ONLINE, { com1: 118.9, com2: 118.9 });
    expect(d).toMatchObject({ status: "ok", station: "EDDF_TWR" });
  });

  it("reports ambiguity instead of picking one of two stations on a frequency", () => {
    const busy = snap([
      ["EDDF_TWR", "118.900", "Tower"],
      ["EDDF2_TWR", "118.900", "Tower"],
    ]);
    const d = matchListenStation(busy, { com1: 118.9, com2: null });
    expect(d.status).toBe("ambiguous");
    expect(d.station).toBeNull();
    expect(d.candidates.sort()).toEqual(["EDDF2_TWR", "EDDF_TWR"]);
  });

  it("does not skip an ambiguous COM1 and fall through to COM2", () => {
    const busy = snap([
      ["EDDF_TWR", "118.900", "Tower"],
      ["EDDF2_TWR", "118.900", "Tower"],
    ]);
    const d = matchListenStation(busy, { com1: 118.9, com2: 121.7 });
    expect(d.status).toBe("ambiguous");
    expect(d.station).toBeNull();
  });

  it("reports offline when a tuned frequency has no controller", () => {
    const d = matchListenStation(ONLINE, { com1: 121.5, com2: 122.8 });
    expect(d).toMatchObject({ status: "offline", frequency: "121.500", radio: "COM1", station: null });
    expect(d.com2).toBe("122.800");
  });

  it("ignores ATIS entries in the controllers list", () => {
    const withAtis = snap([
      ["EDDF_TWR", "118.900", "Tower"],
      ["EDDF_ATIS", "118.900", "Tower"],
    ]);
    expect(matchListenStation(withAtis, { com1: 118.9, com2: null }).station).toBe("EDDF_TWR");
  });

  it("carries the stale flag through from the feed cache", () => {
    expect(matchListenStation(ONLINE, { com1: 118.9, com2: null }, { stale: true }).stale).toBe(true);
  });
});

describe("CabinView route decisions", () => {
  const ok = matchListenStation(ONLINE, { com1: 118.9, com2: null });
  const offline = matchListenStation(ONLINE, { com1: 121.5, com2: null });
  const unavailable = { ...offline, status: "unavailable" as const, station: null };

  it("opens the matching station in the embedded browser", () => {
    const t = desiredCabinRoute(ok);
    expect(t?.path).toBe(CABIN_BROWSER_PATH);
    expect(t?.search).toBe(
      "?url=https%3A%2F%2Flisten.vatsim.net%2Flive%2FEDDF_TWR&returnTo=%2Fcabin%2Fhome",
    );
  });

  it("returns to the ATC screen when nothing may play", () => {
    expect(desiredCabinRoute(offline)).toEqual({ path: CABIN_ATC_PATH, search: "" });
    expect(desiredCabinRoute({ ...offline, status: "no_frequency" })).toEqual({ path: CABIN_ATC_PATH, search: "" });
    expect(desiredCabinRoute({ ...offline, status: "ambiguous" })).toEqual({ path: CABIN_ATC_PATH, search: "" });
  });

  it("leaves the screen alone when the lookup failed or nothing was decided yet", () => {
    expect(desiredCabinRoute(unavailable)).toBeNull();
    expect(desiredCabinRoute(null)).toBeNull();
  });

  it("only acts on the ATC screen and the player", () => {
    expect(isWatchedPath(CABIN_ATC_PATH)).toBe(true);
    expect(isWatchedPath(CABIN_BROWSER_PATH)).toBe(true);
    expect(isWatchedPath("/cabin/home")).toBe(false);
    expect(isWatchedPath("/cabin/map")).toBe(false);
  });

  it("changes identity when either radio changes, so a retune triggers a lookup", () => {
    expect(freqPairKey({ com1: 118.9, com2: null })).not.toBe(freqPairKey({ com1: 118.9, com2: 121.5 }));
    expect(freqPairKey({ com1: 118.9, com2: null })).not.toBe(freqPairKey({ com1: 119.0, com2: null }));
    expect(freqPairKey({ com1: 118.9, com2: null })).toBe(freqPairKey({ com1: 118.9, com2: null }));
  });

  it("formats frequencies the way the feed does", () => {
    expect(mhzKey(118.9)).toBe("118.900");
    expect(mhzKey(null)).toBeNull();
  });
});

describe("GET /api/vatsim/listen", () => {
  let dataDir: string;
  let server: EfbServer;
  let port: number;

  const FEED = {
    general: { update_timestamp: "2026-10-26T10:00:00Z" },
    controllers: [
      { callsign: "EDDF_TWR", name: "Controller One", frequency: "118.900", facility: 4, rating: 1, logon_time: "2026-10-26T09:00:00Z" },
      { callsign: "EDDF_GND", name: "Controller Two", frequency: "121.700", facility: 3, rating: 1, logon_time: "2026-10-26T09:00:00Z" },
    ],
    atis: [],
  };

  const start = async (fetchImpl?: typeof fetch) => {
    dataDir = tmpDir();
    server = createEfbServer({ dataDir, port: 0, version: "9.9.9", logToStdout: false, fetch: fetchImpl });
    port = (await server.start()).port;
  };

  beforeEach(async () => {
    await start(async () => new Response(JSON.stringify(FEED), { status: 200 }) as unknown as Response);
  });
  afterEach(async () => {
    await server.dispose();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("matches a tuned frequency to the online controller", async () => {
    const r = await request(port, "GET", "/api/vatsim/listen?com1=118.900");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "ok", station: "EDDF_TWR", radio: "COM1", frequency: "118.900", com1: "118.900" });
  });

  it("answers offline when no controller sits on the frequency", async () => {
    const r = await request(port, "GET", "/api/vatsim/listen?com1=121.500&com2=122.800");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "offline", station: null, com1: "121.500", com2: "122.800" });
  });

  it("answers no_frequency without contacting VATSIM when nothing is tuned", async () => {
    const r = await request(port, "GET", "/api/vatsim/listen");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "no_frequency", station: null });
  });

  it("rejects malformed frequencies instead of guessing", async () => {
    expect((await request(port, "GET", "/api/vatsim/listen?com1=abc")).status).toBe(400);
    expect((await request(port, "GET", "/api/vatsim/listen?com1=118.9005")).status).toBe(400);
  });

  it("reports 502 when VATSIM cannot be reached, never a station", async () => {
    await server.dispose();
    fs.rmSync(dataDir, { recursive: true, force: true });
    await start(async () => {
      throw new Error("network down");
    });
    const r = await request(port, "GET", "/api/vatsim/listen?com1=118.900");
    expect(r.status).toBe(502);
    expect(r.body).toEqual({ error: "vatsim_unavailable" });
    expect(r.body.station).toBeUndefined();
  });
});

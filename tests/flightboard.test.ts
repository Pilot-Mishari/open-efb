import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { boardForAirport, parseVatsim } from "../packages/integrations/src";
import { FlightBoardResponseSchema, type AirportInfo, type BoardFlight } from "../packages/shared/src";
import { boardRows, boardStatus, boardTimeLabel, boardTimeUtc } from "../apps/web/src/lib/flightboard";
import { createEfbServer, type EfbServer } from "../apps/server/src";
import { request, tmpDir } from "./helpers";

/**
 * A trimmed VATSIM v3 feed (https://vatsim.dev/api/data-api/get-network-data/): network traffic
 * with filed plans, not a real-world airline schedule.
 */
const FEED = {
  general: { version: 165, update_timestamp: "2026-10-27T10:00:00Z" },
  controllers: [],
  atis: [],
  pilots: [
    // airborne, OMDB -> EGLL, filed 18:45Z with a 7 hour enroute time
    { callsign: "EK203", groundspeed: 480, flight_plan: { departure: "OMDB", arrival: "EGLL", deptime: "1845", enroute_time: "0700" } },
    // standing still at its origin, filed EGLL -> OMDB
    { callsign: "BA4", groundspeed: 0, flight_plan: { departure: "EGLL", arrival: "OMDB", deptime: "1200", enroute_time: "0640" } },
    // connected without a filed plan: cannot be placed on any board
    { callsign: "N123AB", groundspeed: 250 },
    // lowercase airport, blank destination and an impossible departure time
    { callsign: "GENVFR1", groundspeed: 0, flight_plan: { departure: "omdb", arrival: "", deptime: "9999", enroute_time: "0100" } },
  ],
  prefiles: [
    // filed but not connected; a zero enroute time means "not stated"
    { callsign: "DLH441", flight_plan: { departure: "OMDB", arrival: "EDDF", deptime: "2210", enroute_time: "0000" } },
  ],
};

const flight = (over: Partial<BoardFlight> = {}): BoardFlight => ({
  id: "x",
  flight: "EK203",
  otherAirport: null,
  filedUtc: null,
  arrivalUtc: null,
  status: null,
  ...over,
});

const airport = (over: Partial<AirportInfo> = {}): AirportInfo => ({
  icao: null,
  iata: null,
  name: null,
  runway: null,
  elevationFt: null,
  lat: null,
  lon: null,
  metar: null,
  taf: null,
  ...over,
});

describe("VATSIM feed parsing (network traffic, not schedules)", () => {
  const snap = parseVatsim(FEED);

  it("keeps flights whose filed plan names an airport and drops pilots without one", () => {
    expect(snap.flights.map((f) => f.callsign)).toEqual(["EK203", "BA4", "GENVFR1", "DLH441"]);
    expect(snap.flights.map((f) => f.prefiled)).toEqual([false, false, false, true]);
  });

  it("normalizes airports, filed times and connection state", () => {
    expect(snap.flights[0]).toMatchObject({
      departure: "OMDB",
      arrival: "EGLL",
      filedUtc: "18:45",
      enrouteMinutes: 420,
      groundspeed: 480,
      prefiled: false,
    });
    expect(snap.flights[2]).toMatchObject({ departure: "OMDB", arrival: null, filedUtc: null, groundspeed: 0 });
    expect(snap.flights[3]).toMatchObject({ filedUtc: "22:10", enrouteMinutes: null, groundspeed: null, prefiled: true });
  });

  it("still reports controllers and rejects a payload that is not the feed", () => {
    expect(snap.controllers).toEqual([]);
    expect(snap.updatedAt).toBe("2026-10-27T10:00:00Z");
    expect(() => parseVatsim({ pilots: [] })).toThrow();
  });
});

describe("board rows from the feed", () => {
  const flights = parseVatsim(FEED).flights;

  it("puts a flight on the departures board of its filed departure and nowhere else", () => {
    const rows = boardForAirport(flights, "omdb", "departures"); // case-insensitive code
    expect(rows.map((r) => r.flight)).toEqual(["EK203", "GENVFR1", "DLH441"]);
    expect(rows[0]).toMatchObject({ otherAirport: "EGLL", filedUtc: "18:45", arrivalUtc: "01:45", status: "airborne" });
    expect(rows[1]).toMatchObject({ otherAirport: null, filedUtc: null, status: "on_ground" });
    expect(rows[2]).toMatchObject({ otherAirport: "EDDF", status: "filed", arrivalUtc: null });
    expect(boardForAirport(flights, "EDDF", "departures")).toEqual([]);
  });

  it("puts a flight on the arrivals board of its filed arrival", () => {
    const rows = boardForAirport(flights, "OMDB", "arrivals");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ flight: "BA4", otherAirport: "EGLL", filedUtc: "12:00", status: "on_ground" });
    expect(rows[0]!.arrivalUtc).toBe("18:40"); // 12:00 + 6h40
  });

  it("rolls the arrival estimate over midnight and leaves it null when the plan has no enroute time", () => {
    expect(boardForAirport(flights, "OMDB", "departures").find((r) => r.flight === "EK203")!.arrivalUtc).toBe("01:45");
    expect(boardForAirport(flights, "OMDB", "departures").find((r) => r.flight === "DLH441")!.arrivalUtc).toBeNull();
  });

  it("validates every row against the shared schema", () => {
    const body = {
      source: "vatsim",
      code: "OMDB",
      fetchedAt: 1,
      stale: false,
      departures: boardForAirport(flights, "OMDB", "departures"),
      arrivals: boardForAirport(flights, "OMDB", "arrivals"),
    };
    expect(() => FlightBoardResponseSchema.parse(body)).not.toThrow();
  });
});

describe("board status display (never invents a status)", () => {
  it("maps the network's own states per direction", () => {
    expect(boardStatus(flight({ status: "filed" }), "departures")).toEqual({ label: "FILED", tone: "normal" });
    expect(boardStatus(flight({ status: "on_ground" }), "arrivals")).toEqual({ label: "ON GROUND", tone: "normal" });
    expect(boardStatus(flight({ status: "airborne" }), "departures")).toEqual({ label: "DEPARTED", tone: "normal" });
    expect(boardStatus(flight({ status: "airborne" }), "arrivals")).toEqual({ label: "IN FLIGHT", tone: "normal" });
  });

  it("shows an em dash when the feed reported no state", () => {
    expect(boardStatus(flight(), "departures").label).toBe("\u2014");
  });
});

describe("board order and times", () => {
  it("sorts by the view's time with timeless rows last and the callsign as tie-breaker", () => {
    const rows = boardRows(
      [
        flight({ id: "a", flight: "A1", filedUtc: "12:00" }),
        flight({ id: "b", flight: "B2", filedUtc: "09:30" }),
        flight({ id: "c", flight: "C3" }),
        flight({ id: "d", flight: "D4", filedUtc: "09:30", arrivalUtc: "20:00" }),
      ],
      "departures",
    );
    expect(rows.map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
    expect(boardRows([flight({ id: "a", filedUtc: "12:00" }), flight({ id: "d", arrivalUtc: "20:00" })], "arrivals").map((r) => r.id)).toEqual(["d", "a"]);
  });

  it("shows the filed time on departures and the plan's arrival estimate on arrivals", () => {
    expect(boardTimeUtc(flight({ filedUtc: "18:45", arrivalUtc: "01:45" }), "departures")).toBe("18:45");
    expect(boardTimeUtc(flight({ filedUtc: "18:45", arrivalUtc: "01:45" }), "arrivals")).toBe("01:45");
    expect(boardTimeUtc(flight({ filedUtc: "18:45" }), "arrivals")).toBeNull();
  });

  it("renders a filed UTC time in the airport's zone, its offset, or UTC with a Z", () => {
    // IANA zone (Asia/Riyadh has no daylight saving, so this is deterministic): 10:00Z -> 13:00.
    expect(boardTimeLabel("10:00", airport({ icao: "OERK" }))).toBe("13:00");
    // Plan-provided UTC offset beats the longitude estimate: 10:00Z at UTC+4 -> 14:00.
    expect(boardTimeLabel("10:00", airport({ icao: "OMDB", timezone: 4, lon: 55.36 }))).toBe("14:00");
    // No zone and no offset: longitude/15, the app's documented fallback (55.36/15 rounds to 4).
    expect(boardTimeLabel("10:00", airport({ icao: "OMDB", lon: 55.36 }))).toBe("14:00");
    // Nothing known about the airport: UTC, marked Z, never a guessed local time.
    expect(boardTimeLabel("10:00", airport({ icao: "ZZZZ" }))).toBe("10:00Z");
    expect(boardTimeLabel("10:00", null)).toBe("10:00Z");
  });

  it("shows a dash for a missing or malformed time", () => {
    expect(boardTimeLabel(null, airport({ icao: "OERK" }))).toBe("\u2014");
    expect(boardTimeLabel("99:99", airport({ icao: "OERK" }))).toBe("\u2014");
  });
});

describe("GET /api/flightboard/:code", () => {
  let dataDir: string;
  let server: EfbServer;
  let port: number;
  const fetchMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(FEED), { status: 200, headers: { "Content-Type": "application/json" } }));
    dataDir = tmpDir();
    server = createEfbServer({ dataDir, port: 0, logToStdout: false, fetch: fetchMock as unknown as typeof fetch });
    port = (await server.start()).port;
  });
  afterEach(async () => {
    await server.dispose();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("rejects malformed airport codes without touching VATSIM", async () => {
    const r = await request(port, "GET", "/api/flightboard/XX");
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "invalid_icao" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves both boards from the keyless VATSIM feed and caches it", async () => {
    const r = await request(port, "GET", "/api/flightboard/omdb");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ source: "vatsim", code: "OMDB", stale: false });
    expect(r.body.departures.map((f: BoardFlight) => f.flight)).toEqual(["EK203", "GENVFR1", "DLH441"]);
    expect(r.body.arrivals.map((f: BoardFlight) => f.flight)).toEqual(["BA4"]);
    // No AirLabs-style configuration or name lookup remains in the response.
    expect(r.body).not.toHaveProperty("configured");
    expect(r.body).not.toHaveProperty("name");
    expect(() => FlightBoardResponseSchema.parse(r.body)).not.toThrow();

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("vatsim-data.json");
    // The second request inside the 30-second TTL reuses the cached feed.
    await request(port, "GET", "/api/flightboard/OMDB");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports 502 when VATSIM cannot be reached", async () => {
    fetchMock.mockImplementation(async () => new Response("upstream down", { status: 500 }));
    const r = await request(port, "GET", "/api/flightboard/OMDB");
    expect(r.status).toBe(502);
    expect(r.body).toEqual({ error: "flightboard_unavailable" });
  });
});
import { describe, expect, it } from "vitest";
import type { AirportInfo, FlightPlan } from "@open-efb/shared";
import type { FlightMapData } from "../apps/web/src/lib/flight-map";
import {
  PHASE_LABEL,
  airportClock,
  deriveFlightPhase,
  elapsedMinutes,
  flightLevel,
  formatPosition,
  liveEta,
  metarTemperatureC,
  nextWaypointLabel,
} from "../apps/web/src/lib/flight-info";

const phase = (over: Partial<Parameters<typeof deriveFlightPhase>[0]> = {}) =>
  deriveFlightPhase({ fresh: true, onGround: true, groundSpeedKt: 0, progress: 0, hasRoute: true, ...over });

describe("deriveFlightPhase", () => {
  it("reports unavailable without fresh telemetry", () => {
    expect(phase({ fresh: false, onGround: null })).toBe("unavailable");
    expect(phase({ fresh: true, onGround: null })).toBe("unavailable");
    expect(PHASE_LABEL.unavailable).toBe("Unavailable");
  });

  it("follows the ground/air and progress data", () => {
    expect(phase()).toBe("boarding"); // parked at the origin
    expect(phase({ groundSpeedKt: 65 })).toBe("departed"); // takeoff roll
    expect(phase({ onGround: false, progress: 40 })).toBe("cruising");
    expect(phase({ onGround: false, progress: 97 })).toBe("approaching");
    expect(phase({ onGround: false, progress: 94 })).toBe("cruising");
    expect(phase({ progress: 99 })).toBe("landed"); // parked at the destination
    expect(phase({ groundSpeedKt: 45, progress: 55 })).toBe("departed"); // stationary mid-route
  });

  it("never claims route progress without a route", () => {
    expect(phase({ hasRoute: false, progress: 0 })).toBe("boarding");
    expect(phase({ hasRoute: false, onGround: false })).toBe("cruising");
    expect(phase({ hasRoute: false, progress: 99, onGround: false })).toBe("cruising");
  });
});

describe("metarTemperatureC", () => {
  it("reads the precision T group", () => {
    expect(metarTemperatureC("METAR OMDB 261000Z 08012KT 9999 FEW030 SCT300 31/M09 Q1008 T03060109")).toBe(30.6);
    expect(metarTemperatureC("T10671089")).toBe(-6.7);
  });

  it("falls back to the approximate temp/dewpoint group", () => {
    expect(metarTemperatureC("261000Z 08012KT 9999 12/07 Q1015")).toBe(12);
    expect(metarTemperatureC("261000Z 08012KT 9999 M02/M05 Q1015")).toBe(-2);
  });

  it("returns null when METAR has no temperature", () => {
    expect(metarTemperatureC("261000Z 08012KT 9999 Q1015")).toBeNull();
    expect(metarTemperatureC(null)).toBeNull();
    expect(metarTemperatureC(undefined)).toBeNull();
  });
});

describe("airportClock", () => {
  const airport = (over: Partial<AirportInfo> = {}): AirportInfo => ({
    icao: null, iata: null, name: null, runway: null, elevationFt: null, lat: null, lon: null, metar: null, taf: null, ...over,
  });

  it("uses the IANA zone so daylight-saving changes are correct", () => {
    // EGLL: 12:00Z in January is 12:00 local (GMT), in July 13:00 (BST).
    expect(airportClock(airport({ icao: "EGLL" }), new Date("2026-01-15T12:00:00Z"))).toBe("12:00");
    expect(airportClock(airport({ icao: "EGLL" }), new Date("2026-07-15T12:00:00Z"))).toBe("13:00");
  });

  it("falls back to the plan's UTC offset, then to longitude/15", () => {
    expect(airportClock(airport({ timezone: 4 }), new Date("2026-01-15T12:00:00Z"))).toBe("16:00");
    expect(airportClock(airport({ lon: 55.5 }), new Date("2026-01-15T12:00:00Z"))).toBe("16:00");
  });

  it("returns null when nothing is known", () => {
    expect(airportClock(airport(), new Date("2026-01-15T12:00:00Z"))).toBeNull();
    expect(airportClock(null, new Date())).toBeNull();
  });
});

describe("flightLevel / formatPosition", () => {
  it("rounds altitude to hundreds of feet", () => {
    expect(flightLevel(35000)).toBe("FL350");
    expect(flightLevel(940)).toBe("FL009");
    expect(flightLevel(50)).toBeNull(); // on the ground
    expect(flightLevel(null)).toBeNull();
  });

  it("formats the position with quadrant letters", () => {
    expect(formatPosition(24.8106, 55.9586)).toBe("24.8106°N 55.9586°E");
    expect(formatPosition(-33.9461, 151.1772)).toBe("33.9461°S 151.1772°E");
    expect(formatPosition(null, 12)).toBeNull();
  });
});

describe("liveEta", () => {
  const now = Date.parse("2026-01-15T12:00:00Z");

  it("derives ETE and ETA from remaining distance over speed", () => {
    const eta = liveEta({ airborne: true, groundSpeedKt: 450, remainingNm: 900, nowMs: now });
    expect(eta?.eteMinutes).toBe(120);
    expect(eta?.etaMs).toBe(Date.parse("2026-01-15T14:00:00Z"));
  });

  it("returns null unless the flight is airborne with a usable speed", () => {
    expect(liveEta({ airborne: false, groundSpeedKt: 450, remainingNm: 900, nowMs: now })).toBeNull();
    expect(liveEta({ airborne: true, groundSpeedKt: 0, remainingNm: 900, nowMs: now })).toBeNull();
    expect(liveEta({ airborne: true, groundSpeedKt: 450, remainingNm: 0, nowMs: now })).toBeNull();
    expect(liveEta({ airborne: true, groundSpeedKt: null, remainingNm: 900, nowMs: now })).toBeNull();
  });
});

describe("elapsedMinutes", () => {
  const plan = { times: { estimatedOut: "2026-01-15T11:00:00Z", scheduledOut: "2026-01-15T10:45:00Z", estimatedIn: null, enrouteMinutes: 180 } } as FlightPlan;
  const now = Date.parse("2026-01-15T12:30:00Z");

  it("counts from the estimated departure while under way", () => {
    expect(elapsedMinutes("cruising", plan, now)).toBe(90);
    expect(elapsedMinutes("approaching", plan, now)).toBe(90);
    expect(elapsedMinutes("departed", plan, now)).toBe(90);
  });

  it("is null before departure, on the ground and without a plan", () => {
    expect(elapsedMinutes("boarding", plan, now)).toBeNull();
    expect(elapsedMinutes("landed", plan, now)).toBeNull();
    expect(elapsedMinutes("unavailable", plan, now)).toBeNull();
    expect(elapsedMinutes("cruising", null, now)).toBeNull();
    expect(elapsedMinutes("cruising", plan, Date.parse("2026-01-15T10:00:00Z"))).toBeNull();
  });
});

describe("nextWaypointLabel", () => {
  const point = (label: string, lat = 10, lon = 20) => ({ lat, lon, label, kind: "waypoint" as const });
  const map = (over: Partial<FlightMapData> = {}): FlightMapData => ({
    route: [], travelledRoute: [], remainingRoute: [], currentPoint: null,
    totalDistanceNm: 0, travelledNm: 0, remainingNm: 0, progress: 0, ...over,
  });

  it("takes the fix after the projection onto the current segment", () => {
    const m = map({
      currentPoint: { lat: 10, lon: 20, label: "Aircraft", kind: "aircraft" },
      remainingRoute: [point("LERGA"), point("RODIP"), point("Destination", 30, 40)],
    });
    expect(nextWaypointLabel(m, "OMDB")).toBe("RODIP");
    expect(nextWaypointLabel({ ...m, remainingRoute: [point("LERGA"), point("Destination", 30, 40)] }, "OMDB")).toBe("OMDB");
  });

  it("is null without a position or at the end of the route", () => {
    expect(nextWaypointLabel(map(), "OMDB")).toBeNull();
    const done = map({ currentPoint: { lat: 1, lon: 2, label: "Aircraft", kind: "aircraft" }, remainingRoute: [] });
    expect(nextWaypointLabel(done, "OMDB")).toBeNull();
  });
});

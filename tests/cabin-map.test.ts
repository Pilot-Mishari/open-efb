import { describe, expect, it } from "vitest";
import type { FlightPlan, Telemetry } from "@open-efb/shared";
import { buildFlightMapData } from "../apps/web/src/lib/flight-map";

const plan = {
  origin: { icao: "KJFK", lat: 40.6413, lon: -73.7781 },
  destination: { icao: "KATL", lat: 33.6367, lon: -84.4281 },
  navlog: [
    { ident: "JFK", lat: 40.6413, lon: -73.7781 },
    { ident: "A", lat: 39.5, lon: -76.0 },
    { ident: "B", lat: 37.8, lon: -79.5 },
    { ident: "ATL", lat: 33.6367, lon: -84.4281 },
  ],
} as unknown as FlightPlan;

const telemetry = {
  values: { latitudeDeg: 38.2, longitudeDeg: -81.4, altitudeFt: 34000, groundSpeedKt: 450, indicatedAirspeedKt: 440, headingTrueDeg: 180, verticalSpeedFpm: 200, outsideAirTempC: -20, onGround: false },
} as Telemetry;

describe("buildFlightMapData", () => {
  it("computes route distance, progress, and current position from existing plan and telemetry", () => {
    const data = buildFlightMapData(plan, telemetry);
    expect(data.totalDistanceNm).toBeGreaterThan(0);
    expect(data.travelledNm).toBeGreaterThanOrEqual(0);
    expect(data.remainingNm).toBeGreaterThanOrEqual(0);
    expect(data.progress).toBeGreaterThanOrEqual(0);
    expect(data.progress).toBeLessThanOrEqual(100);
    expect(data.currentPoint).toMatchObject({ lat: 38.2, lon: -81.4 });
  });

  it("returns an empty route when the flight plan is missing", () => {
    const data = buildFlightMapData(null, telemetry);
    expect(data.route.length).toBe(0);
    expect(data.progress).toBe(0);
  });
});

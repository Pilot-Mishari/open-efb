import { describe, expect, it } from "vitest";
import type { FlightPlan, Telemetry } from "@open-efb/shared";
import { CABIN_FEATURES, cabinFeaturePath } from "../apps/web/src/lib/cabin-features";
import { deriveFlightWidget, NOT_AVAILABLE } from "../apps/web/src/lib/flight-widget";
import type { SimKind, SimState } from "../apps/web/src/lib/sim-state";

const values = { latitudeDeg: 1, longitudeDeg: 2, altitudeFt: 34000.4, groundSpeedKt: 451.6, indicatedAirspeedKt: null, headingTrueDeg: null, trackTrueDeg: null, verticalSpeedFpm: null, outsideAirTempC: null, onGround: false };
const telemetry = (v = values): Telemetry => ({ source: "fsuipc", status: "connected", detail: null, updatedAt: 1, values: v });

function sim(kind: SimKind, t: Telemetry | null = null): SimState {
  return { kind, label: `label:${kind}`, detail: null, telemetry: t, sourceLabel: "x", ageMs: 0, isLive: kind === "live" };
}

const plan = {
  callsign: "SVA123", flightNumber: "123",
  destination: { icao: "OEJN", iata: "JED" },
  times: { scheduledOut: null, estimatedOut: null, estimatedIn: "2026-10-21T08:35:00Z", enrouteMinutes: 120 },
} as unknown as FlightPlan;

describe("deriveFlightWidget", () => {
  it("shows Not available for everything when there is no plan and no simulator", () => {
    const d = deriveFlightWidget(null, sim("disconnected"));
    expect(d).toMatchObject({ flight: NOT_AVAILABLE, eta: NOT_AVAILABLE, altitude: NOT_AVAILABLE, groundSpeed: null, tone: "off" });
    expect(d.status).toBe("label:disconnected");
  });

  it("uses plan data for flight and ETA", () => {
    const d = deriveFlightWidget(plan, sim("disconnected"));
    expect(d).toMatchObject({ flight: "123", eta: "08:35Z", altitude: NOT_AVAILABLE });
  });

  it("falls back to the callsign when the plan has no flight number", () => {
    expect(deriveFlightWidget({ ...plan, flightNumber: null } as FlightPlan, sim("disconnected")).flight).toBe("SVA123");
  });

  it("shows live altitude and ground speed", () => {
    const d = deriveFlightWidget(plan, sim("live", telemetry()));
    expect(d).toMatchObject({ altitude: "34,000 ft", groundSpeed: "452 kt", tone: "live", simulated: false });
  });

  it("labels mock data as simulated", () => {
    expect(deriveFlightWidget(plan, sim("mock", telemetry()))).toMatchObject({ altitude: "34,000 ft", simulated: true, tone: "warn" });
  });

  it("never shows stale telemetry as a current value", () => {
    const d = deriveFlightWidget(plan, sim("stale", telemetry()));
    expect(d.altitude).toBe(NOT_AVAILABLE);
    expect(d.groundSpeed).toBeNull();
  });

  it("shows Not available when the simulator did not supply altitude", () => {
    expect(deriveFlightWidget(plan, sim("live", telemetry({ ...values, altitudeFt: null }))).altitude).toBe(NOT_AVAILABLE);
  });
});

describe("CABIN_FEATURES", () => {
  it("has unique ids and routes under /cabin that never clash with home or the welcome page", () => {
    const ids = CABIN_FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(cabinFeaturePath(id)).toMatch(/^\/cabin\/[a-z-]+$/);
    expect(ids).not.toContain("home");
    expect(ids).toEqual(expect.arrayContaining(["atc", "flight-information", "about-flight"]));
  });
});
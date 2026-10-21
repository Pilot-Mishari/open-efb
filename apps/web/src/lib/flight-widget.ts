import type { FlightPlan } from "@open-efb/shared";
import type { SimState } from "./sim-state";
import { utcTime } from "./format";

export const NOT_AVAILABLE = "Not available";

export type WidgetTone = "live" | "warn" | "off";

export interface FlightWidgetData {
  flight: string;
  /** ETA from the active flight plan. It is a plan value, never a live estimate. */
  eta: string;
  /** Backwards-compatible alias for the ETA/time row. */
  arrival: string;
  altitude: string;
  groundSpeed: string | null;
  destination: string | null;
  /** Short status line, taken from the shared simulator state so every screen words it the same way. */
  status: string;
  tone: WidgetTone;
  /** True when telemetry values on show are from the mock source and must be labelled as simulated. */
  simulated: boolean;
}

const fmt = (v: number | null | undefined, unit: string): string | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : `${Math.round(v).toLocaleString("en-US")} ${unit}`;

/**
 * Turns the existing flight plan and simulator state into what the widget shows.
 * Telemetry is only read when the shared state says it is fresh (live or labelled mock),
 * so stale or missing data can never appear as a current value.
 */
export function deriveFlightWidget(plan: FlightPlan | null, sim: SimState): FlightWidgetData {
  const flying = sim.kind === "live" || sim.kind === "mock";
  const v = flying ? sim.telemetry?.values : undefined;
  const eta = utcTime(plan?.times.estimatedIn);
  const dest = plan?.destination.icao ?? plan?.destination.iata ?? null;
  const etaText = eta === "\u2014" ? NOT_AVAILABLE : eta;
  return {
    flight: plan?.flightNumber ?? plan?.callsign ?? NOT_AVAILABLE,
    eta: etaText,
    arrival: etaText,
    altitude: fmt(v?.altitudeFt, "ft") ?? NOT_AVAILABLE,
    groundSpeed: fmt(v?.groundSpeedKt, "kt"),
    destination: dest,
    status: sim.label,
    tone: sim.kind === "live" ? "live" : sim.kind === "mock" || sim.kind === "stale" || sim.kind === "connecting" || sim.kind === "waiting-sim" || sim.kind === "waiting" ? "warn" : "off",
    simulated: sim.kind === "mock",
  };
}
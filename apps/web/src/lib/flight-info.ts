import type { AirportInfo, FlightPlan } from "@open-efb/shared";
import { airportTimeZone, type FlightMapData } from "./flight-map";

/**
 * Pure data derivations for the CabinView Flight Information screen. Everything here only
 * rearranges values that already exist (flight plan, telemetry, map progress); nothing is guessed,
 * and every function returns null/"unavailable" when its inputs are missing.
 */

export type FlightPhase = "boarding" | "departed" | "cruising" | "approaching" | "landed" | "unavailable";

export const PHASE_LABEL: Record<FlightPhase, string> = {
  boarding: "Boarding",
  departed: "Departed",
  cruising: "Cruising",
  approaching: "Approaching",
  landed: "Landed",
  unavailable: "Unavailable",
};

export interface PhaseInput {
  /** True only when the shared simulator state reports fresh data (live or labelled mock). */
  fresh: boolean;
  onGround: boolean | null;
  groundSpeedKt: number | null;
  /** 0-100 along the planned route; always 0 when no plan is loaded. */
  progress: number;
  /** True when the plan produced a route with at least an origin and a destination. */
  hasRoute: boolean;
}

/**
 * Where the flight is, from actual data only: fresh telemetry says ground/air, and the planned
 * route's progress says where along it the aircraft is. Anything less (no telemetry, no route
 * context) reports "unavailable" instead of a guess.
 */
export function deriveFlightPhase(input: PhaseInput): FlightPhase {
  if (!input.fresh || input.onGround === null) return "unavailable";
  const progress = Number.isFinite(input.progress) ? input.progress : 0;
  const gs = input.groundSpeedKt !== null && Number.isFinite(input.groundSpeedKt) ? input.groundSpeedKt : 0;

  if (input.onGround) {
    if (input.hasRoute && progress >= 90) return "landed"; // parked or rolling at the destination
    if (gs >= 30) return "departed"; // takeoff roll at the origin
    if (input.hasRoute && progress > 10) return "departed"; // stationary mid-route: the journey started
    return "boarding";
  }
  if (input.hasRoute && progress >= 95) return "approaching";
  return "cruising";
}

/** Temperature in °C straight from a METAR's precision (T-group) or approximate (dd/dd) group. */
export function metarTemperatureC(metar: string | null | undefined): number | null {
  if (!metar) return null;
  const precise = /\bT([01])(\d{3})([01])(\d{3})\b/.exec(metar);
  if (precise) {
    const sign = precise[1] === "1" ? -1 : 1;
    return (sign * Number(precise[2])) / 10;
  }
  const approximate = /\b(M?\d{2})\/M?\d{2}\b/.exec(metar);
  if (approximate) {
    const raw = approximate[1] ?? "";
    const negative = raw.startsWith("M");
    const value = Number(raw.replace("M", ""));
    if (Number.isFinite(value)) return negative ? -value : value;
  }
  return null;
}

/**
 * Wall-clock time at an airport right now. Uses the IANA zone when it is known, so daylight-saving
 * changes are correct; otherwise falls back to the plan's UTC offset (or longitude/15, like the
 * lock screen does) and returns null when neither exists.
 */
export function airportClock(airport: AirportInfo | null | undefined, when: Date): string | null {
  if (!airport) return null;
  const zone = airportTimeZone(airport.icao);
  if (zone) {
    try {
      // The IANA zone follows daylight-saving time, so this path is the correct one.
      return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: zone }).format(when);
    } catch {
      /* unknown zone value: fall through to the numeric offset */
    }
  }
  const offsetH = airport.timezone ?? (airport.lon === null || airport.lon === undefined ? null : Math.round(airport.lon / 15));
  if (offsetH === null || !Number.isFinite(offsetH) || Number.isNaN(when.getTime())) return null;
  const shifted = new Date(when.getTime() + offsetH * 3_600_000);
  return `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}`;
}

/** Flight level in hundreds of feet ("FL350"); null below 100 ft or without a reading. */
export function flightLevel(altFt: number | null | undefined): string | null {
  if (altFt === null || altFt === undefined || !Number.isFinite(altFt) || altFt < 100) return null;
  return `FL${String(Math.round(altFt / 100)).padStart(3, "0")}`;
}

export interface LiveEta {
  etaMs: number;
  eteMinutes: number;
}

/** ETA/ETE from remaining distance over current ground speed; null unless airborne with a real speed. */
export function liveEta(input: { airborne: boolean; groundSpeedKt: number | null; remainingNm: number; nowMs: number }): LiveEta | null {
  const gs = input.groundSpeedKt;
  if (!input.airborne || gs === null || !Number.isFinite(gs) || gs < 30) return null;
  if (!Number.isFinite(input.remainingNm) || input.remainingNm <= 0) return null;
  const hours = input.remainingNm / gs;
  return { etaMs: input.nowMs + hours * 3_600_000, eteMinutes: Math.round(hours * 60) };
}

/**
 * Minutes since departure while the flight is under way, measured from the plan's estimated (or
 * scheduled) departure because no actual off-block time exists in the data. Callers must label it
 * as an estimate; it is null before departure and when nothing is known.
 */
export function elapsedMinutes(phase: FlightPhase, plan: FlightPlan | null, nowMs: number): number | null {
  if (phase !== "departed" && phase !== "cruising" && phase !== "approaching") return null;
  const refIso = plan?.times.estimatedOut ?? plan?.times.scheduledOut ?? null;
  if (!refIso) return null;
  const ref = new Date(refIso).getTime();
  if (Number.isNaN(ref) || nowMs <= ref) return null;
  return Math.floor((nowMs - ref) / 60_000);
}

/**
 * The fix ahead of the aircraft. remainingRoute[0] is always the projection onto the current
 * segment, so the next real point of the plan sits at index 1; null without a position or at the
 * end of the route.
 */
export function nextWaypointLabel(map: FlightMapData, destinationIcao: string | null): string | null {
  if (!map.currentPoint) return null;
  const next = map.remainingRoute[1] ?? null;
  if (!next) return null;
  if (next.label === "Destination") return destinationIcao ?? "Destination";
  if (next.label === "Departure") return null;
  return next.label;
}

/** "24.8106°N 55.9586°E", or null when the position is missing. */
export function formatPosition(lat: number | null | undefined, lon: number | null | undefined): string | null {
  if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns} ${Math.abs(lon).toFixed(4)}°${ew}`;
}

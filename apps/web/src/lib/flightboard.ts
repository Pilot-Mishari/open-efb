import type { AirportInfo, BoardFlight } from "@open-efb/shared";
import { airportTimeZone } from "./flight-map";

/**
 * Pure display logic for the Airport Flight Board. Every label maps a state VATSIM actually
 * reported: the network feed has no delays, cancellations or published schedules, so the board
 * shows none, and a row without a state or a time gets an em dash instead of a guess.
 */

export type BoardView = "departures" | "arrivals";

export type StatusTone = "normal" | "warn" | "alert";

export interface StatusDisplay {
  label: string;
  tone: StatusTone;
}

const DASH = "\u2014";

/**
 * Network state per board direction:
 *
 * - filed     -> FILED (plan is on the network, the pilot has not connected yet)
 * - on_ground -> ON GROUND (connected pilot standing still; where they are is not claimed)
 * - airborne  -> DEPARTED on a departures board (this airport is their filed departure, so they
 *                have left), IN FLIGHT on an arrivals board (they are still coming)
 * - no state  -> an em dash; nothing is ever invented
 */
export function boardStatus(flight: BoardFlight, view: BoardView): StatusDisplay {
  switch (flight.status) {
    case "filed":
      return { label: "FILED", tone: "normal" };
    case "on_ground":
      return { label: "ON GROUND", tone: "normal" };
    case "airborne":
      return { label: view === "departures" ? "DEPARTED" : "IN FLIGHT", tone: "normal" };
    default:
      return { label: DASH, tone: "normal" };
  }
}

/** The time shown and sorted by: filed off-block on departures, the plan's arrival estimate on arrivals. */
export function boardTimeUtc(flight: BoardFlight, view: BoardView): string | null {
  return view === "arrivals" ? flight.arrivalUtc : flight.filedUtc;
}

/**
 * Rows in board order: earliest first by the view's time, flights without any time last,
 * callsign as the tie-breaker so the list never jumps between refreshes.
 */
export function boardRows(flights: readonly BoardFlight[], view: BoardView): BoardFlight[] {
  return [...flights].sort((a, b) => {
    const ta = boardTimeUtc(a, view) ?? "zz:zz";
    const tb = boardTimeUtc(b, view) ?? "zz:zz";
    return ta.localeCompare(tb) || a.flight.localeCompare(b.flight);
  });
}

/** Minutes past midnight for "HH:MM"; null for anything that is not a time of day. */
function minutesOfDay(hm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * A filed UTC time in the displaying airport's own zone: the IANA zone when it is known (which
 * follows daylight-saving changes), otherwise the plan's UTC offset or longitude/15 like every
 * other clock in the app. When neither exists the time is shown in UTC with a trailing "Z" —
 * a wrong local time is never displayed, and a missing time is an em dash.
 */
export function boardTimeLabel(utcHm: string | null, airport: AirportInfo | null): string {
  if (!utcHm) return DASH;
  const m = minutesOfDay(utcHm);
  if (m === null) return DASH;
  const zone = airportTimeZone(airport?.icao ?? null);
  if (zone) {
    try {
      const now = new Date();
      const instant = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, m));
      return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: zone }).format(instant);
    } catch {
      /* unknown zone value: fall through to the numeric offset */
    }
  }
  const offsetH = airport?.timezone ?? (airport?.lon === null || airport?.lon === undefined ? null : Math.round(airport.lon / 15));
  if (offsetH !== null && Number.isFinite(offsetH)) {
    const shifted = (((m + Math.round(offsetH * 60)) % 1440) + 1440) % 1440;
    return `${String(Math.floor(shifted / 60)).padStart(2, "0")}:${String(shifted % 60).padStart(2, "0")}`;
  }
  return `${utcHm}Z`;
}
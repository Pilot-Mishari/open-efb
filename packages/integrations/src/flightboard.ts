import type { BoardFlight, FlightBoardStatus } from "@open-efb/shared";
import type { VatsimFlight } from "./vatsim";

export type BoardDirection = "departures" | "arrivals";

/**
 * Board rows for one airport, taken from VATSIM's public network feed
 * (https://vatsim.dev/api/data-api/get-network-data/): a flight goes on the departures board when
 * its filed departure is this airport, and on the arrivals board when its filed arrival is.
 *
 * The feed is network traffic, not a real-world airline schedule — it carries no airline names,
 * gates, published times or delays, so only the callsign, the other end of the sector, the filed
 * times and the network's own state are mapped. Everything else is left out rather than invented.
 */
export function boardForAirport(flights: readonly VatsimFlight[], code: string, direction: BoardDirection): BoardFlight[] {
  const key = code.toUpperCase();
  const departures = direction === "departures";
  const rows: BoardFlight[] = [];
  flights.forEach((f, i) => {
    if ((departures ? f.departure : f.arrival) !== key) return;
    rows.push({
      id: `${f.prefiled ? "prefile" : "pilot"}:${f.callsign}:${f.filedUtc ?? ""}:${i}`,
      flight: f.callsign,
      otherAirport: departures ? f.arrival : f.departure,
      filedUtc: f.filedUtc,
      arrivalUtc: arrivalUtc(f),
      status: boardStatus(f),
    });
  });
  return rows;
}

/**
 * The plan's own estimated arrival: filed off-block plus its enroute time, rolled over midnight.
 * Null unless both parts exist — the feed has no arrival time, so one is never made up.
 */
export function arrivalUtc(f: VatsimFlight): string | null {
  if (f.filedUtc === null || f.enrouteMinutes === null) return null;
  const [h, m] = f.filedUtc.split(":").map(Number);
  const total = (((h ?? 0) * 60 + (m ?? 0) + f.enrouteMinutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The network's own states, one-to-one: a prefiled plan is "filed", a connected pilot standing
 * still is "on ground", a moving one is "airborne". A pilot whose groundspeed is missing has no
 * state to report, so the row keeps null and the board shows a dash instead of a guess.
 */
function boardStatus(f: VatsimFlight): FlightBoardStatus | null {
  if (f.prefiled) return "filed";
  if (f.groundspeed === null) return null;
  return f.groundspeed > 0 ? "airborne" : "on_ground";
}
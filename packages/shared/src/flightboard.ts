import { z } from "zod";

/**
 * A flight's state exactly as the VATSIM network feed reports it: a plan filed but not yet flown,
 * a connected pilot standing still, or a connected pilot moving. The feed carries no delays,
 * cancellations, gates or published schedules, so none of those may ever appear on the board.
 */
export const FlightBoardStatusSchema = z.enum(["filed", "on_ground", "airborne"]);
export type FlightBoardStatus = z.infer<typeof FlightBoardStatusSchema>;

/** One row of a departures or arrivals board, taken from VATSIM network traffic. */
export const BoardFlightSchema = z.object({
  /** Stable-enough identity for list keys: source, callsign, filed time and row index. */
  id: z.string(),
  /** Network callsign, e.g. "EK203". VATSIM has no separate airline flight-number field. */
  flight: z.string(),
  /** ICAO of the other end of the sector: destination on departures, origin on arrivals. */
  otherAirport: z.string().nullable(),
  /** Filed off-block time "HH:MM" UTC from the plan; null when the plan sent none. */
  filedUtc: z.string().nullable(),
  /**
   * Filed estimated arrival "HH:MM" UTC: off-block time plus the plan's own enroute time, with
   * midnight rollover applied. Null when either part is missing — the feed has no arrival time
   * of its own, so nothing is invented.
   */
  arrivalUtc: z.string().nullable(),
  /** The network's own state for this flight, or null when it reported none. */
  status: FlightBoardStatusSchema.nullable(),
});
export type BoardFlight = z.infer<typeof BoardFlightSchema>;

/**
 * Response of GET /api/flightboard/:code. Everything comes from VATSIM's public network feed
 * (keyless, the same one the ATC listener uses), filtered to flights whose filed plan touches
 * this airport — network traffic, not real-world airline schedules. `stale` means VATSIM could
 * not be refreshed and an older snapshot is being shown.
 */
export const FlightBoardResponseSchema = z.object({
  source: z.literal("vatsim"),
  code: z.string(),
  /** When Open EFB last fetched the feed (ms epoch). */
  fetchedAt: z.number(),
  stale: z.boolean(),
  departures: z.array(BoardFlightSchema),
  arrivals: z.array(BoardFlightSchema),
});
export type FlightBoardResponse = z.infer<typeof FlightBoardResponseSchema>;
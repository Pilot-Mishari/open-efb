import { z } from "zod";

export const VatsimControllerSchema = z.object({
  callsign: z.string(),
  name: z.string().nullable(),
  /** Frequency in MHz with three decimals, e.g. "118.900". */
  frequency: z.string().nullable(),
  position: z.string(),
  onlineSince: z.string().nullable(),
});
export type VatsimController = z.infer<typeof VatsimControllerSchema>;

export const VatsimAtisSchema = z.object({
  callsign: z.string(),
  code: z.string().nullable(),
  frequency: z.string().nullable(),
  text: z.array(z.string()),
});
export type VatsimAtis = z.infer<typeof VatsimAtisSchema>;

/**
 * Answer to "which VATSIM station should the ATC player open for the frequencies the aircraft is tuned to".
 * It never guesses: any state other than "ok" means nothing may be opened.
 */
export const ListenStatusSchema = z.enum([
  "ok", // exactly one controller is online on the selected frequency
  "no_frequency", // no usable COM frequency is available from the simulator
  "offline", // a frequency is tuned but no controller is online on it
  "ambiguous", // several controllers share the tuned frequency
  "unavailable", // the VATSIM feed could not be reached
]);
export type ListenStatus = z.infer<typeof ListenStatusSchema>;

export const ListenDecisionSchema = z.object({
  status: ListenStatusSchema,
  /** COM1/COM2 active frequencies as MHz strings ("118.900") that were matched, null when unknown or out of band. */
  com1: z.string().nullable(),
  com2: z.string().nullable(),
  /** The radio whose frequency the decision is based on, when one was chosen. */
  radio: z.enum(["COM1", "COM2"]).nullable(),
  /** Frequency (MHz string) the decision refers to: the matched, ambiguous or offline one. */
  frequency: z.string().nullable(),
  /** VATSIM Listen station id (the controller callsign), only when status is "ok". */
  station: z.string().nullable(),
  position: z.string().nullable(),
  controller: z.string().nullable(),
  /** Callsigns found on the frequency when status is "ambiguous". */
  candidates: z.array(z.string()),
  /** True when the feed could not be refreshed and this decision is based on an older snapshot. */
  stale: z.boolean(),
});
export type ListenDecision = z.infer<typeof ListenDecisionSchema>;

export const VatsimAirportSchema = z.object({
  icao: z.string(),
  /** When VATSIM generated the snapshot (ISO), if reported. */
  updatedAt: z.string().nullable(),
  /** When Open EFB last fetched it (ms epoch). */
  fetchedAt: z.number(),
  /** True when VATSIM could not be reached and an older snapshot is shown. */
  stale: z.boolean(),
  controllers: z.array(VatsimControllerSchema),
  atis: z.array(VatsimAtisSchema),
});
export type VatsimAirport = z.infer<typeof VatsimAirportSchema>;
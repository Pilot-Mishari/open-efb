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
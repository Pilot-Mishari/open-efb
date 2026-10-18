import { z } from "zod";

const nstr = z.string().nullable();
const nnum = z.number().nullable();

export const AirportInfoSchema = z.object({
  icao: nstr,
  iata: nstr,
  name: nstr,
  runway: nstr,
  elevationFt: nnum,
  lat: nnum,
  lon: nnum,
  metar: nstr,
  taf: nstr,
});
export type AirportInfo = z.infer<typeof AirportInfoSchema>;

export const FixSchema = z.object({
  ident: z.string(),
  airway: nstr,
  altitudeFt: nnum,
  lat: nnum,
  lon: nnum,
  stage: nstr,
});
export type Fix = z.infer<typeof FixSchema>;

/** Normalized SimBrief OFP. Every value SimBrief did not supply is null, never guessed. */
export const FlightPlanSchema = z.object({
  fetchedAt: z.number(),
  generatedAt: nstr,
  airac: nstr,
  /** Weight unit of fuel and weights, or null when the OFP did not say. */
  units: z.enum(["kg", "lb"]).nullable(),
  callsign: nstr,
  flightNumber: nstr,
  airline: nstr,
  aircraft: z.object({ icao: nstr, name: nstr, registration: nstr }),
  origin: AirportInfoSchema,
  destination: AirportInfoSchema,
  alternate: AirportInfoSchema.nullable(),
  route: nstr,
  cruiseAltitudeFt: nnum,
  costIndex: nnum,
  distanceNm: nnum,
  times: z.object({ scheduledOut: nstr, estimatedOut: nstr, estimatedIn: nstr, enrouteMinutes: nnum }),
  fuel: z.object({
    taxi: nnum, enrouteBurn: nnum, contingency: nnum, alternate: nnum,
    reserve: nnum, planTakeoff: nnum, planRamp: nnum, planLanding: nnum,
  }),
  weights: z.object({
    payload: nnum, zfw: nnum, tow: nnum, ldw: nnum, maxZfw: nnum, maxTow: nnum, maxLdw: nnum, pax: nnum,
  }),
  navlog: z.array(FixSchema),
  pdfUrl: nstr,
});
export type FlightPlan = z.infer<typeof FlightPlanSchema>;

export const FlightPlanResponseSchema = z.object({ plan: FlightPlanSchema, stale: z.boolean() });
export type FlightPlanResponse = z.infer<typeof FlightPlanResponseSchema>;
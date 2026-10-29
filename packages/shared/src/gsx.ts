import { z } from "zod";

/**
 * Read-only view of FSDreamTeam GSX Pro's Remote API (v2), a WebSocket service GSX hosts on this
 * computer (default 127.0.0.1:8744). Every field here is something GSX itself sent — nothing is
 * inferred, and no field is ever filled in from another source.
 *
 * Service ids, state codes and message shapes follow the GSX Remote API guide that ships with GSX
 * Pro; the same contract is implemented by third-party clients such as Fragtality/Any2GSX.
 */

/** The service ids GSX uses in its `services` payload. "Departure" is GSX's name for pushback. */
export const GsxServiceIdSchema = z.enum([
  "Deboarding",
  "Catering",
  "Refueling",
  "Boarding",
  "Departure",
  "OperateJetways",
  "OperateStairs",
  "GPU",
  "DeIce",
  "Lavatory",
  "Water",
  "Cleaning",
]);
export type GsxServiceId = z.infer<typeof GsxServiceIdSchema>;

/**
 * GSX's own service state code:
 * 0 unknown, 1 callable/requested, 2 not available, 3 bypassed, 4 requested,
 * 5 active, 6 completed, 7 completing.
 */
export const GsxServiceStateSchema = z.number().int().min(0).max(7);
export type GsxServiceState = z.infer<typeof GsxServiceStateSchema>;

export const GsxServiceSchema = z.object({
  id: GsxServiceIdSchema,
  stateRaw: GsxServiceStateSchema,
  canTrigger: z.boolean(),
  /** Handling company GSX selected, when it reported one. */
  operator: z.string().nullable(),
  /**
   * Text written by GSX itself (e.g. "Boarding 45/120"). It is shown verbatim and never parsed
   * into counts or percentages, because its wording differs between GSX versions and locales.
   */
  progressText: z.string().nullable(),
});
export type GsxService = z.infer<typeof GsxServiceSchema>;

/** GSX's service ids rendered for people. "Departure" is GSX's own name for pushback. */
export const GSX_SERVICE_LABELS: Record<GsxServiceId, string> = {
  Boarding: "Boarding",
  Deboarding: "Deboarding",
  Catering: "Catering",
  Refueling: "Refuelling",
  Departure: "Pushback",
  OperateJetways: "Jetway",
  OperateStairs: "Stairs",
  GPU: "Ground power",
  DeIce: "De-icing",
  Lavatory: "Lavatory",
  Water: "Water",
  Cleaning: "Cleaning",
};

/** Display order for the ground-services grid, most interesting to the passenger first. */
export const GSX_SERVICE_ORDER: readonly GsxServiceId[] = [
  "Boarding",
  "Deboarding",
  "Catering",
  "Refueling",
  "Departure",
  "OperateJetways",
  "OperateStairs",
  "GPU",
  "DeIce",
  "Lavatory",
  "Water",
  "Cleaning",
];

/** GSX's state codes 0-7 rendered as words, indexed by `GsxService.stateRaw`. */
export const GSX_SERVICE_STATES = [
  "Unknown",
  "Available",
  "Not available",
  "Bypassed",
  "Requested",
  "Active",
  "Completed",
  "Completing",
] as const;

/**
 * How the connection to GSX is going:
 * - "unavailable": GSX Pro is not installed here (or this is not the simulator computer).
 * - "unreachable": GSX is installed but its Remote API did not answer — GSX is not running, or the
 *   Remote control server is switched off in GSX Settings.
 * - "connecting": a connection attempt is in progress.
 * - "connected": the socket is open and the handshake completed.
 */
export const GsxConnectionSchema = z.enum(["unavailable", "unreachable", "connecting", "connected"]);
export type GsxConnection = z.infer<typeof GsxConnectionSchema>;

export const GsxAirportSchema = z.object({
  icao: z.string(),
  name: z.string().nullable(),
});

export const GsxGateSchema = z.object({
  /** Gate/parking name exactly as GSX displays it. */
  name: z.string(),
  terminal: z.string().nullable(),
});

export const GsxPushbackSchema = z.object({
  /**
   * Directions this parking position allows. This is the parking's capability, not a selection —
   * GSX's Remote API does not report which direction was chosen once a pushback is under way.
   */
  directions: z.array(z.string()),
  /** Tug type configured for this parking: "towbar", "towbarless", "mototok", "any" or "disabled". */
  tugType: z.string().nullable(),
  /** The pushback service itself (GSX id "Departure"), when GSX listed it. */
  service: GsxServiceSchema.nullable(),
});

export const GsxStatusSchema = z.object({
  connection: GsxConnectionSchema,
  /** Short explanation shown to the user; never contains a local filesystem path. */
  detail: z.string().nullable(),
  /** GSX's own "the engine is running" flag, or null before the handshake finished. */
  gsxRunning: z.boolean().nullable(),
  protocol: z.number().nullable(),
  engine: z.string().nullable(),
  /** Simulator GSX reports, e.g. "MSFS2024" or "MSFS2020". */
  sim: z.string().nullable(),
  capabilities: z.array(z.string()),
  airport: GsxAirportSchema.nullable(),
  gate: GsxGateSchema.nullable(),
  aircraft: z.object({ icaoType: z.string().nullable(), isCargo: z.boolean().nullable() }).nullable(),
  services: z.array(GsxServiceSchema),
  pushback: GsxPushbackSchema.nullable(),
  /** Server clock (epoch ms) of the last message received from GSX, or null if none yet. */
  updatedAt: z.number().nullable(),
});
export type GsxStatus = z.infer<typeof GsxStatusSchema>;

/** Sent over the WebSocket next to telemetry so screens update as GSX changes, without polling. */
export const GsxMessageSchema = z.object({
  type: z.literal("gsx"),
  serverTime: z.number(),
  gsx: GsxStatusSchema,
});
export type GsxMessage = z.infer<typeof GsxMessageSchema>;

/**
 * Answer to "ask GSX to start this service" (the `service.trigger` command of its Remote API).
 * `code` is GSX's own error code or a local one ("not_connected", "timeout") — never invented
 * wording, so the screen can show exactly what GSX said.
 */
export const GsxTriggerResultSchema = z.object({
  ok: z.boolean(),
  code: z.string().nullable(),
  message: z.string().nullable(),
});
export type GsxTriggerResult = z.infer<typeof GsxTriggerResultSchema>;

/** A status with nothing connected yet, used before the first handshake and by tests. */
export function emptyGsxStatus(connection: GsxConnection, detail: string | null = null): GsxStatus {
  return {
    connection,
    detail,
    gsxRunning: null,
    protocol: null,
    engine: null,
    sim: null,
    capabilities: [],
    airport: null,
    gate: null,
    aircraft: null,
    services: [],
    pushback: null,
    updatedAt: null,
  };
}

import { z } from "zod";

/** Where a telemetry stream comes from. "mock" is only ever used for development and must be labelled as simulated. */
export const SimSourceSchema = z.enum(["fsuipc", "mock"]);
export type SimSource = z.infer<typeof SimSourceSchema>;

export const SimStatusSchema = z.enum(["disabled", "connecting", "connected", "disconnected"]);
export type SimStatus = z.infer<typeof SimStatusSchema>;

/** Every value is null when the simulator did not supply it. Nothing is ever estimated or filled in. */
export const TelemetryValuesSchema = z.object({
  latitudeDeg: z.number().nullable(),
  longitudeDeg: z.number().nullable(),
  /** Altitude above mean sea level, feet. */
  altitudeFt: z.number().nullable(),
  groundSpeedKt: z.number().nullable(),
  indicatedAirspeedKt: z.number().nullable(),
  headingTrueDeg: z.number().nullable(),
  /** No verified source yet, always null. */
  trackTrueDeg: z.number().nullable(),
  verticalSpeedFpm: z.number().nullable(),
  outsideAirTempC: z.number().nullable(),
  onGround: z.boolean().nullable(),
  /** COM1 active (receiving) frequency in MHz, e.g. 118.9, or null when the simulator reported none. */
  com1ActiveMhz: z.number().nullable(),
  /** COM2 active (receiving) frequency in MHz, e.g. 119.9, or null when the simulator reported none. */
  com2ActiveMhz: z.number().nullable(),
});
export type TelemetryValues = z.infer<typeof TelemetryValuesSchema>;

export const TelemetrySchema = z.object({
  source: SimSourceSchema.nullable(),
  status: SimStatusSchema,
  /** Short human-readable explanation of the status, shown to the user. */
  detail: z.string().nullable(),
  /** Server clock (epoch ms) of the last valid data sample, or null if none yet. */
  updatedAt: z.number().nullable(),
  values: TelemetryValuesSchema,
});
export type Telemetry = z.infer<typeof TelemetrySchema>;

/** Sent over the WebSocket and returned by GET /api/telemetry. serverTime lets clients measure age without trusting their own clock. */
export const TelemetryMessageSchema = z.object({
  type: z.literal("telemetry"),
  serverTime: z.number(),
  telemetry: TelemetrySchema,
});
export type TelemetryMessage = z.infer<typeof TelemetryMessageSchema>;
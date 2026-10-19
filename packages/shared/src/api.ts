import { z } from "zod";

export const HealthSchema = z.object({
  app: z.literal("open-efb"),
  version: z.string(),
  uptimeSeconds: z.number(),
});
export type Health = z.infer<typeof HealthSchema>;

export const SessionSchema = z.object({
  authenticated: z.boolean(),
  role: z.enum(["local", "client"]).nullable(),
  label: z.string().nullable(),
});
export type SessionInfo = z.infer<typeof SessionSchema>;

import { z } from "zod";

export const HealthSchema = z.object({
  app: z.literal("open-efb"),
  version: z.string(),
  uptimeSeconds: z.number(),
});
export type Health = z.infer<typeof HealthSchema>;

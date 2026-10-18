import { z } from "zod";

export const DEFAULT_PORT = 4780;

export const UnitsSchema = z.object({
  altitude: z.enum(["ft", "m"]).default("ft"),
  speed: z.enum(["kt", "kmh"]).default("kt"),
  temperature: z.enum(["C", "F"]).default("C"),
  weight: z.enum(["kg", "lb"]).default("kg"),
});

export const SettingsSchema = z.object({
  /** LAN access is opt-in. When false the server binds to loopback only. */
  lanAccessEnabled: z.boolean().default(false),
  port: z.number().int().min(1024).max(65535).default(DEFAULT_PORT),
  /** Telemetry broadcast rate in Hz. */
  telemetryRateHz: z.number().min(0.5).max(20).default(2),
  theme: z.enum(["dark", "light"]).default("dark"),
  units: UnitsSchema.default(() => UnitsSchema.parse({})),
});

export type Settings = z.infer<typeof SettingsSchema>;

/** Fields a client may change through PATCH /api/settings. */
export const SettingsPatchSchema = SettingsSchema.partial().strict();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export const defaultSettings = (): Settings => SettingsSchema.parse({});

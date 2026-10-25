import { z } from "zod";

export const DEFAULT_PORT = 4780;
export const DEFAULT_FSUIPC_PORT = 2048;

const unitFields = {
  altitude: z.enum(["ft", "m"]),
  speed: z.enum(["kt", "kmh"]),
  temperature: z.enum(["C", "F"]),
  weight: z.enum(["kg", "lb"]),
};

const fields = {
  lanAccessEnabled: z.boolean(),
  port: z.number().int().min(1024).max(65535),
  telemetryRateHz: z.number().min(0.5).max(20),
  theme: z.enum(["dark", "light"]),
  simbriefUser: z.string().trim().max(64),
  chartsProvider: z.enum(["chartfox", "navigraph"]),
  simulatorEnabled: z.boolean(),
  fsuipcPort: z.number().int().min(1024).max(65535),
  autoLaunchOnSimulator: z.boolean(),
  startWithWindows: z.boolean(),
};

export const UnitsSchema = z.object({
  altitude: unitFields.altitude.default("ft"),
  speed: unitFields.speed.default("kt"),
  temperature: unitFields.temperature.default("C"),
  weight: unitFields.weight.default("kg"),
});

export const SettingsSchema = z.object({
  lanAccessEnabled: fields.lanAccessEnabled.default(false),
  port: fields.port.default(DEFAULT_PORT),
  telemetryRateHz: fields.telemetryRateHz.default(2),
  theme: fields.theme.default("dark"),
  simbriefUser: fields.simbriefUser.default(""),
  chartsProvider: fields.chartsProvider.default("chartfox"),
  units: UnitsSchema.default(() => UnitsSchema.parse({})),
  simulatorEnabled: fields.simulatorEnabled.default(true),
  fsuipcPort: fields.fsuipcPort.default(DEFAULT_FSUIPC_PORT),
  autoLaunchOnSimulator: fields.autoLaunchOnSimulator.default(true),
  startWithWindows: fields.startWithWindows.default(false),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsPatchSchema = z.object({ ...fields, units: z.object(unitFields).partial().strict() }).partial().strict();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export const defaultSettings = (): Settings => SettingsSchema.parse({});
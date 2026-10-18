import { HealthSchema, SettingsSchema, type Health, type Settings, type SettingsPatch } from "@open-efb/shared";

async function json<T>(res: Response, parse: (v: unknown) => T): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: string }).error ?? "";
    } catch {
      /* body not JSON */
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return parse(await res.json());
}

export const api = {
  health: (): Promise<Health> => fetch("/api/health").then((r) => json(r, (v) => HealthSchema.parse(v))),
  settings: (): Promise<Settings> => fetch("/api/settings").then((r) => json(r, (v) => SettingsSchema.parse(v))),
  patchSettings: (patch: SettingsPatch): Promise<Settings> =>
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => json(r, (v) => SettingsSchema.parse((v as { settings: unknown }).settings))),
};

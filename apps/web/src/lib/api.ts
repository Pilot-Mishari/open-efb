import {
  FlightPlanResponseSchema, HealthSchema, OfpTextResponseSchema, SettingsSchema, VatsimAirportSchema,
  type FlightPlanResponse, type Health, type OfpTextResponse, type Settings, type SettingsPatch, type VatsimAirport,
} from "@open-efb/shared";

/** Error carrying the server's machine-readable code, e.g. "simbrief_user_not_found". */
export class ApiError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ?? code);
  }
}

async function json<T>(res: Response, parse: (v: unknown) => T): Promise<T> {
  if (!res.ok) {
    let body: { error?: string; message?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* body not JSON */
    }
    throw new ApiError(body.error ?? `http_${res.status}`, body.message);
  }
  return parse(await res.json());
}

export const api = {
  health: (): Promise<Health> => fetch("/api/health").then((r) => json(r, (v) => HealthSchema.parse(v))),
  settings: (): Promise<Settings> => fetch("/api/settings").then((r) => json(r, (v) => SettingsSchema.parse(v))),
  patchSettings: (patch: SettingsPatch): Promise<Settings> =>
    fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).then((r) =>
      json(r, (v) => SettingsSchema.parse((v as { settings: unknown }).settings)),
    ),
  simbrief: (refresh = false): Promise<FlightPlanResponse> =>
    fetch(`/api/simbrief/latest${refresh ? "?refresh=1" : ""}`).then((r) => json(r, (v) => FlightPlanResponseSchema.parse(v))),
    ofpText: (): Promise<OfpTextResponse> => fetch("/api/simbrief/ofp").then((r) => json(r, (v) => OfpTextResponseSchema.parse(v))),
  vatsimAirport: (icao: string): Promise<VatsimAirport> =>
    fetch(`/api/vatsim/airport/${encodeURIComponent(icao)}`).then((r) => json(r, (v) => VatsimAirportSchema.parse(v))),
};

/** Plain-language text for the error codes the server can return. */
export function describeError(e: unknown): string {
  const code = e instanceof ApiError ? e.code : "network";
  switch (code) {
    case "simbrief_user_not_set": return "No SimBrief username is set.";
    case "simbrief_user_not_found": return "SimBrief does not know that username or Pilot ID.";
    case "simbrief_invalid_plan": return "Your latest SimBrief plan is missing its origin or destination.";
    case "simbrief_upstream": return "SimBrief could not be reached. Try again in a moment.";
    case "vatsim_unavailable": return "VATSIM data is unavailable right now.";
    case "invalid_icao": return "Enter a 3 or 4 character airport code.";
    case "admin_local_only": return "This can only be changed on the computer running Open EFB.";
    default: return "Could not reach the Open EFB server.";
  }
}
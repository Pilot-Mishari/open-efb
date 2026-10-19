import {
  FlightPlanResponseSchema, HealthSchema, OfpTextResponseSchema, SessionSchema, SettingsSchema, VatsimAirportSchema,
  type FlightPlanResponse, type Health, type OfpTextResponse, type SessionInfo, type Settings, type SettingsPatch, type VatsimAirport,
} from "@open-efb/shared";

export class ApiError extends Error {
  constructor(readonly code: string, message?: string, readonly retryAfter?: number) {
    super(message ?? code);
  }
}

async function json<T>(res: Response, parse: (v: unknown) => T): Promise<T> {
  if (!res.ok) {
    let body: { error?: string; message?: string; retryAfterSeconds?: number } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* body not JSON */
    }
    if (res.status === 401 && body.error === "unauthorized") window.dispatchEvent(new Event("efb:unauthorized"));
    throw new ApiError(body.error ?? `http_${res.status}`, body.message, body.retryAfterSeconds);
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
  session: (): Promise<SessionInfo> => fetch("/api/session").then((r) => json(r, (v) => SessionSchema.parse(v))),
  pair: (code: string): Promise<void> =>
    fetch("/api/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).then((r) => json(r, () => undefined)),
  logout: (): Promise<void> => fetch("/api/session/logout", { method: "POST" }).then((r) => json(r, () => undefined)),
  ofpText: (): Promise<OfpTextResponse> => fetch("/api/simbrief/ofp").then((r) => json(r, (v) => OfpTextResponseSchema.parse(v))),
  vatsimAirport: (icao: string): Promise<VatsimAirport> =>
    fetch(`/api/vatsim/airport/${encodeURIComponent(icao)}`).then((r) => json(r, (v) => VatsimAirportSchema.parse(v))),
};

export function describeError(e: unknown): string {
  const code = e instanceof ApiError ? e.code : "network";
  switch (code) {
    case "simbrief_user_not_set": return "No SimBrief username is set.";
    case "simbrief_user_not_found": return "SimBrief does not know that username or Pilot ID.";
    case "simbrief_invalid_plan": return "Your latest SimBrief plan is missing its origin or destination.";
    case "simbrief_upstream": return "SimBrief could not be reached. Try again in a moment.";
    case "vatsim_unavailable": return "VATSIM data is unavailable right now.";
    case "invalid_icao": return "Enter a 3 or 4 character airport code.";
    case "invalid_code": return "That code is not right. Check the PC and try again.";
    case "pairing_locked": return `Too many attempts. Wait ${e instanceof ApiError && e.retryAfter ? e.retryAfter : 60} seconds, then use the new code on the PC.`;
    case "pairing_closed": return "Network access is switched off on the PC.";
    case "unauthorized": return "This device is no longer connected.";
    case "admin_local_only": return "This can only be changed on the computer running Open EFB.";
    default: return "Could not reach the Open EFB server.";
  }
}
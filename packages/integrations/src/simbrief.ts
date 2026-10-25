import type { AirportInfo, FlightPlan, Fix } from "@open-efb/shared";
import { USER_AGENT, list, num, rec, str, type Rec } from "./util";

export type SimbriefErrorCode = "user_not_found" | "upstream" | "invalid_plan";

export class SimbriefError extends Error {
  constructor(
    readonly code: SimbriefErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SimbriefError";
  }
}

/** Numeric input is treated as a Pilot ID (up to 7 digits); anything else as a username. */
export function buildSimbriefUrl(user: string): string {
  const u = user.trim();
  if (!u) throw new SimbriefError("user_not_found", "No SimBrief username set");
  const key = /^\d{1,7}$/.test(u) ? "userid" : "username";
  return `https://www.simbrief.com/api/xml.fetcher.php?${key}=${encodeURIComponent(u)}&json=v2`;
}

/** SimBrief sends Unix seconds in XML and ISO 8601 in JSON v2; accept both. */
function iso(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (/^\d{9,11}$/.test(s)) return new Date(Number(s) * 1000).toISOString();
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Durations are seconds in XML and HH:MM:SS in JSON v2. */
function minutes(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  if (/^\d+$/.test(s)) return Math.round(Number(s) / 60);
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) + Math.round(Number(m[3]) / 60) : null;
}

function airport(raw: unknown): AirportInfo {
  const a = rec(raw);
  return {
    icao: str(a.icao_code),
    iata: str(a.iata_code),
    name: str(a.name),
    runway: str(a.plan_rwy),
    elevationFt: num(a.elevation),
    lat: num(a.pos_lat),
    lon: num(a.pos_long),
    metar: str(a.metar),
    taf: str(a.taf),
    timezone: num(a.timezone),
  };
}

function safePdfUrl(files: Rec): string | null {
  const dir = str(files.directory);
  const link = str(rec(files.pdf).link);
  if (!dir || !link) return null;
  try {
    const u = new URL(link, dir.endsWith("/") ? dir : `${dir}/`);
    const ok = u.protocol === "https:" && (u.hostname === "simbrief.com" || u.hostname.endsWith(".simbrief.com"));
    return ok ? u.toString() : null;
  } catch {
    return null;
  }
}

function fix(raw: unknown): Fix | null {
  const f = rec(raw);
  const ident = str(f.ident);
  if (!ident) return null;
  return { ident, airway: str(f.via_airway), altitudeFt: num(f.altitude_feet), lat: num(f.pos_lat), lon: num(f.pos_long), stage: str(f.stage) };
}

/**
 * Converts a SimBrief OFP (JSON v2, or the older json=1 shape) into our model.
 * Field names come from SimBrief's public documentation and third-party clients and
 * are read defensively: anything missing becomes null.
 */
export function normalizeSimbriefOfp(raw: unknown, now: number = Date.now()): FlightPlan {
  const r = rec(raw);
  const general = rec(r.general);
  const origin = airport(r.origin);
  const destination = airport(r.destination);
  if (!origin.icao || !destination.icao) throw new SimbriefError("invalid_plan", "The flight plan has no origin or destination");

  const altn = list(r.alternates)[0] ?? r.alternate;
  const alternate = airport(altn);
  const navRaw = r.navlog;
  const fixes = Array.isArray(navRaw) ? navRaw : list(rec(navRaw).fix);
  const params = rec(r.params);
  const aircraft = rec(r.aircraft);
  const times = rec(r.times);
  const fuel = rec(r.fuel);
  const weights = rec(r.weights);
  const unit = str(params.units)?.toLowerCase();

  return {
    fetchedAt: now,
    generatedAt: iso(params.time_generated),
    airac: str(params.airac),
    units: unit?.startsWith("kg") ? "kg" : unit?.startsWith("lb") ? "lb" : null,
    callsign: str(rec(r.atc).callsign),
    flightNumber: str(general.flight_number),
    airline: str(general.icao_airline),
    aircraft: { icao: str(aircraft.icaocode) ?? str(aircraft.icao_code), name: str(aircraft.name), registration: str(aircraft.reg) },
    origin,
    destination,
    alternate: alternate.icao ? alternate : null,
    route: str(general.route),
    cruiseAltitudeFt: num(general.initial_altitude),
    costIndex: num(general.costindex),
    distanceNm: num(general.route_distance),
    times: { scheduledOut: iso(times.sched_out), estimatedOut: iso(times.est_out), estimatedIn: iso(times.est_in), enrouteMinutes: minutes(times.est_time_enroute) },
    fuel: {
      taxi: num(fuel.taxi), enrouteBurn: num(fuel.enroute_burn), contingency: num(fuel.contingency), alternate: num(fuel.alternate_burn),
      reserve: num(fuel.reserve), planTakeoff: num(fuel.plan_takeoff), planRamp: num(fuel.plan_ramp), planLanding: num(fuel.plan_landing),
    },
    weights: {
      payload: num(weights.payload), zfw: num(weights.est_zfw), tow: num(weights.est_tow), ldw: num(weights.est_ldw),
      maxZfw: num(weights.max_zfw), maxTow: num(weights.max_tow), maxLdw: num(weights.max_ldw), pax: num(weights.pax_count),
    },
    navlog: fixes.map(fix).filter((f): f is Fix => f !== null),
    pdfUrl: safePdfUrl(rec(r.files)),
  };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const MAX_OFP_CHARS = 1_000_000;

export function htmlToText(html: string): string {
  return html
    .replace(/\r\n?/g, "\n")
    .replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|pre|table)\s*>/gi, "\n")
    .replace(/<\/t[dh]\s*>/gi, "  ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function extractOfpText(raw: unknown): string | null {
  const html = rec(rec(raw).text).plan_html;
  if (typeof html !== "string") return null;
  const text = htmlToText(html.slice(0, MAX_OFP_CHARS * 2)).slice(0, MAX_OFP_CHARS);
  return text === "" ? null : text;
}

export interface LatestOfp {
  plan: FlightPlan;
  text: string | null;
}

export interface FetchOptions {
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

/** Fetches and normalizes the user's most recent OFP. Throws SimbriefError. */
export async function fetchLatestOfp(user: string, opts: FetchOptions = {}): Promise<LatestOfp> {
  const f = opts.fetch ?? fetch;
  let res: Response;
  let text: string;
  try {
    res = await f(buildSimbriefUrl(user), { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) });
    text = await res.text();
  } catch (err) {
    if (err instanceof SimbriefError) throw err;
    throw new SimbriefError("upstream", "Could not reach SimBrief");
  }
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* error bodies may be XML */
  }
  const status = str(rec(rec(json).fetch).status) ?? /Error:[^<"\n]*/.exec(text)?.[0] ?? null;
  if (!res.ok || (status !== null && !/^success/i.test(status))) {
    const detail = status ?? `HTTP ${res.status}`;
    throw new SimbriefError(/unknown|not found|invalid/i.test(detail) ? "user_not_found" : "upstream", detail);
  }
  if (json === null) throw new SimbriefError("upstream", "SimBrief returned an unreadable response");
    return { plan: normalizeSimbriefOfp(json, (opts.now ?? Date.now)()), text: extractOfpText(json) };
}
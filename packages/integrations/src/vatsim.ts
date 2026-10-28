import type { VatsimAirport, VatsimAtis, VatsimController, ListenDecision } from "@open-efb/shared";
import { USER_AGENT, isRec, list, num, rec, str, type Rec } from "./util";

export const VATSIM_DATA_URL = "https://data.vatsim.net/v3/vatsim-data.json";

/** The parts of a filed plan (or prefiled one) that an airport board can honestly show. */
export interface VatsimFlight {
  callsign: string;
  /** ICAO of the filed departure/arrival airport, uppercased; null when the plan left it blank. */
  departure: string | null;
  arrival: string | null;
  /** Filed off-block time "HH:MM" UTC (the feed sends "HHMM"); null when missing or malformed. */
  filedUtc: string | null;
  /** Filed enroute time in minutes; null when missing or zero (no flight takes zero minutes). */
  enrouteMinutes: number | null;
  /** Live groundspeed in knots; null for a prefile, which has no position at all. */
  groundspeed: number | null;
  /** True when the plan is prefiled on the network rather than flown by a connected pilot. */
  prefiled: boolean;
}

/** Only the parts of the feed we need; everything else in the payload is discarded. */
export interface VatsimSnapshot {
  updatedAt: string | null;
  controllers: VatsimController[];
  atis: VatsimAtis[];
  /** Filed/online flights whose plan names an airport — the raw material for the flight board. */
  flights: VatsimFlight[];
}

const POSITIONS: Record<number, { label: string; order: number }> = {
  2: { label: "Delivery", order: 0 },
  3: { label: "Ground", order: 1 },
  4: { label: "Tower", order: 2 },
  5: { label: "Approach", order: 3 },
  6: { label: "Centre", order: 4 },
  1: { label: "Flight service", order: 5 },
};

/** Normalizes to "118.900". Observers use 199.998, which is not a real frequency. */
function freq(v: unknown): string | null {
  const x = num(v);
  return x === null || x <= 0 || x === 199.998 ? null : x.toFixed(3);
}

/** "1845" -> "18:45". Anything that is not four digits within a day -> null, never a guessed time. */
function hhmm(v: unknown): string | null {
  const s = str(v);
  if (!s || !/^\d{4}$/.test(s)) return null;
  const h = Number(s.slice(0, 2));
  const m = Number(s.slice(2));
  if (h > 23 || m > 59) return null;
  return `${s.slice(0, 2)}:${s.slice(2)}`;
}

/** The plan's enroute time in minutes; zero or malformed means "not stated". */
function enrouteMinutes(v: unknown): number | null {
  const hm = hhmm(v);
  if (!hm) return null;
  const [h, m] = hm.split(":").map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0);
  return total > 0 ? total : null;
}

/** One connected pilot or prefiled plan with a filed plan; pilots without one cannot go on a board. */
function planFlight(r: Rec, prefiled: boolean): VatsimFlight | null {
  const callsign = str(r.callsign);
  if (!callsign || !isRec(r.flight_plan)) return null;
  const fp = rec(r.flight_plan);
  const up = (v: unknown): string | null => str(v)?.toUpperCase() ?? null;
  return {
    callsign,
    departure: up(fp.departure),
    arrival: up(fp.arrival),
    filedUtc: hhmm(fp.deptime),
    enrouteMinutes: enrouteMinutes(fp.enroute_time),
    groundspeed: prefiled ? null : num(r.groundspeed),
    prefiled,
  };
}

export function parseVatsim(raw: unknown): VatsimSnapshot {
  if (!isRec(raw) || !Array.isArray(raw.controllers)) throw new Error("unexpected VATSIM data format");
  const general = rec(raw.general);
  const controllers: (VatsimController & { order: number })[] = [];
  for (const c of raw.controllers) {
    const r = rec(c);
    const callsign = str(r.callsign);
    const pos = POSITIONS[num(r.facility) ?? -1];
    if (!callsign || !pos) continue; // skips observers and unknown facility types
    controllers.push({ callsign, name: str(r.name), frequency: freq(r.frequency), position: pos.label, onlineSince: str(r.logon_time), order: pos.order });
  }
  controllers.sort((a, b) => a.order - b.order || a.callsign.localeCompare(b.callsign));
  const atis: VatsimAtis[] = [];
  for (const a of list(raw.atis)) {
    const r = rec(a);
    const callsign = str(r.callsign);
    if (!callsign) continue;
    const text = Array.isArray(r.text_atis) ? r.text_atis.filter((l): l is string => typeof l === "string") : typeof r.text_atis === "string" ? r.text_atis.split("\n") : [];
    atis.push({ callsign, code: str(r.atis_code), frequency: freq(r.frequency), text });
  }
  // Connected pilots first, then prefiled plans: rows whose filed plan names no airport are kept
  // out entirely, because they can never appear on any board.
  const flights: VatsimFlight[] = [];
  for (const [key, prefiled] of [["pilots", false], ["prefiles", true]] as const) {
    for (const item of list(raw[key])) {
      if (!isRec(item)) continue;
      const flight = planFlight(item, prefiled);
      if (flight && (flight.departure || flight.arrival)) flights.push(flight);
    }
  }
  return { updatedAt: str(general.update_timestamp), controllers: controllers.map(({ order: _o, ...c }) => c), atis, flights };
}

/** US callsigns usually drop the leading K (JFK_TWR for KJFK), so match both forms. */
export function airportPrefixes(icao: string): string[] {
  const code = icao.toUpperCase();
  return code.length === 4 && code.startsWith("K") ? [`${code}_`, `${code.slice(1)}_`] : [`${code}_`];
}

/**
 * Automatic ATC listening: the radio the aircraft is tuned to decides which station is opened,
 * so everything below works from frequencies only and never from user input.
 */
export type RadioKey = "COM1" | "COM2";

/** VATSIM position frequencies are VHF airband only; anything outside this is not a station. */
const BAND_MIN_MHZ = 118;
const BAND_MAX_MHZ = 136.975;

/** Normalizes a tuned frequency to the feed's "118.900" form, or null when it cannot be a station frequency. */
export function tuneKey(mhz: number | null | undefined): string | null {
  if (typeof mhz !== "number" || !Number.isFinite(mhz)) return null;
  const rounded = Math.round(mhz * 1000) / 1000;
  if (rounded < BAND_MIN_MHZ || rounded > BAND_MAX_MHZ) return null;
  return rounded.toFixed(3);
}

/**
 * Picks the station to listen to from the aircraft's active COM frequencies.
 *
 * FSUIPC does not expose which of COM1/COM2 is selected for receiving in MSFS 2020/2024, so the
 * documented fallback is: COM1 (the primary radio, where ATC is normally tuned) wins whenever it
 * has a match, and COM2 is only used when COM1 has none. Ambiguity (several controllers on one
 * frequency) is reported instead of resolved: nothing may be opened unless exactly one station fits.
 */
export function matchListenStation(
  snap: VatsimSnapshot,
  radios: { com1: number | null; com2: number | null },
  meta: { stale?: boolean } = {},
): ListenDecision {
  const com1 = tuneKey(radios.com1);
  const com2 = tuneKey(radios.com2);
  const base = {
    com1,
    com2,
    radio: null,
    frequency: null,
    station: null,
    position: null,
    controller: null,
    candidates: [] as string[],
    stale: meta.stale === true,
  };

  if (!com1 && !com2) return { ...base, status: "no_frequency" };

  // Preference order: COM1 first, which is the receive-selection fallback described above.
  const tuned: { key: string; radio: RadioKey }[] = [];
  if (com1) tuned.push({ key: com1, radio: "COM1" });
  if (com2) tuned.push({ key: com2, radio: "COM2" });

  for (const { key, radio } of tuned) {
    const hits = snap.controllers.filter((c) => c.frequency === key && !c.callsign.toUpperCase().endsWith("_ATIS"));
    if (hits.length === 1) {
      const c = hits[0]!;
      return { ...base, status: "ok", radio, frequency: key, station: c.callsign, position: c.position, controller: c.name };
    }
    if (hits.length > 1) {
      return { ...base, status: "ambiguous", radio, frequency: key, candidates: hits.map((h) => h.callsign) };
    }
    // No controller online on this radio: fall through to the next tuned radio.
  }

  return { ...base, status: "offline", radio: com1 ? "COM1" : "COM2", frequency: com1 ?? com2 };
}

export function forAirport(snap: VatsimSnapshot, icao: string, meta: { fetchedAt: number; stale: boolean }): VatsimAirport {
  const prefixes = airportPrefixes(icao);
  const match = (callsign: string) => prefixes.some((p) => callsign.toUpperCase().startsWith(p));
  return {
    icao: icao.toUpperCase(),
    updatedAt: snap.updatedAt,
    fetchedAt: meta.fetchedAt,
    stale: meta.stale,
    controllers: snap.controllers.filter((c) => match(c.callsign) && !c.callsign.toUpperCase().endsWith("_ATIS")),
    atis: snap.atis.filter((a) => match(a.callsign)),
  };
}

export async function fetchVatsim(opts: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<VatsimSnapshot> {
  const res = await (opts.fetch ?? fetch)(VATSIM_DATA_URL, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
  if (!res.ok) throw new Error(`VATSIM responded with HTTP ${res.status}`);
  return parseVatsim(await res.json());
}
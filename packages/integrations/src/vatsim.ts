import type { VatsimAirport, VatsimAtis, VatsimController } from "@open-efb/shared";
import { USER_AGENT, isRec, list, num, rec, str } from "./util";

export const VATSIM_DATA_URL = "https://data.vatsim.net/v3/vatsim-data.json";

/** Only the parts of the feed we need; the full feed (pilots etc.) is discarded. */
export interface VatsimSnapshot {
  updatedAt: string | null;
  controllers: VatsimController[];
  atis: VatsimAtis[];
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
  return { updatedAt: str(general.update_timestamp), controllers: controllers.map(({ order: _o, ...c }) => c), atis };
}

/** US callsigns usually drop the leading K (JFK_TWR for KJFK), so match both forms. */
export function airportPrefixes(icao: string): string[] {
  const code = icao.toUpperCase();
  return code.length === 4 && code.startsWith("K") ? [`${code}_`, `${code.slice(1)}_`] : [`${code}_`];
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
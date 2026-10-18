/** "08:35Z" from an ISO timestamp, or an em dash when unknown. */
export function utcTime(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "\u2014" : `${d.toISOString().slice(11, 16)}Z`;
}

export function utcDateTime(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "\u2014" : `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}Z`;
}

export function duration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "\u2014";
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function amount(v: number | null | undefined, unit?: string | null): string {
  if (v === null || v === undefined) return "\u2014";
  return `${Math.round(v).toLocaleString("en-US")}${unit ? ` ${unit}` : ""}`;
}

export function ago(ms: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)} min ago`;
}
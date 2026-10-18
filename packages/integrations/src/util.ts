export type Rec = Record<string, unknown>;

export const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
export const rec = (v: unknown): Rec => (isRec(v) ? v : {});

export function str(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  return typeof v === "number" && Number.isFinite(v) ? String(v) : null;
}

export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  }
  return null;
}

/** Arrays pass through; a single object becomes a one-item array; {} and null become []. */
export function list(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  return isRec(v) && Object.keys(v).length > 0 ? [v] : [];
}

export const USER_AGENT = "OpenEFB/0.1 (open-source flight simulation EFB)";
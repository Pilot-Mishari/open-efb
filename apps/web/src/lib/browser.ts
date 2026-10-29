export type EmbeddedBrowserOptions = {
  route?: string;
  returnTo?: string;
};

export function buildEmbeddedBrowserUrl(rawUrl: string, options?: EmbeddedBrowserOptions): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const route = options?.route ?? "/browser";
    const params = new URLSearchParams();
    params.set("url", url.toString());

    if (options?.returnTo && options.returnTo.startsWith("/")) {
      params.set("returnTo", options.returnTo);
    }

    const query = params.toString();
    return query ? `${route}?${query}` : route;
  } catch {
    return null;
  }
}

export function normalizeVatsimStationId(raw: string | null): string | null {
  if (!raw) return null;

  const directValue = raw.trim();
  if (!directValue) return null;

  const candidate = directValue
    .replace(/^(?:https?:\/\/)?listen\.vatsim\.net\/(?:live\/)?/i, "")
    .replace(/^\/+/, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/gi, "")
    .toUpperCase();

  if (!candidate) return null;

  // A VATSIM Listen station is a VATSIM controller callsign: 2 to 4 underscore-separated
  // groups of letters/digits, e.g. EDDF_TWR, KJFK_GND, OTHH_1_GND, LON_CTR.
  const parts = candidate.split("_").filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return null;
  if (candidate.length > 32) return null;
  if (!parts.every((p) => /^[A-Z0-9]{1,10}$/.test(p))) return null;

  return parts.join("_");
}

/**
 * VATSIM Listen cannot be framed: its sign-in is an OAuth redirect to auth.vatsim.net, which
 * answers every cross-origin frame with X-Frame-Options: SAMEORIGIN and Cross-Origin-Resource-Policy:
 * same-origin (the browser reports ERR_BLOCKED_BY_RESPONSE), and browsers partition iframe storage so
 * a sign-in completed at top level never carries into the frame either. The player therefore gets its
 * own window for this host, where the VATSIM sign-in works once and the session is remembered.
 * Every other site keeps using the embedded iframe.
 */
export function needsPlayerWindow(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).hostname === "listen.vatsim.net";
  } catch {
    return false;
  }
}

export function buildVatsimListenUrl(rawStation: string): string | null {
  const station = normalizeVatsimStationId(rawStation);
  if (!station) return null;

  // Verified against the Listen app's own router: it matches /^\/live\/([^/]+)\/?$/i,
  // uppercases the segment and selects that callsign once its online list arrives.
  return `https://listen.vatsim.net/live/${station}`;
}

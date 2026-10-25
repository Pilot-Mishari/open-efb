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
    .replace(/https?:\/\/listen\.vatsim\.net\//i, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/gi, "")
    .toUpperCase();

  if (!candidate) return null;

  const parts = candidate.split("_").filter(Boolean);
  if (parts.length !== 3) return null;

  const [airportCode, sequence, service] = parts;
  if (!airportCode || !sequence || !service) return null;
  if (!/^[A-Z]{4}$/.test(airportCode)) return null;
  if (!/^\d+$/.test(sequence) || Number(sequence) < 1) return null;
  if (!/^[A-Z]+$/.test(service)) return null;

  return `${airportCode}_${sequence}_${service}`;
}

export function buildVatsimListenUrl(rawStation: string): string | null {
  const station = normalizeVatsimStationId(rawStation);
  if (!station) return null;

  return `https://listen.vatsim.net/live/${station}`;
}

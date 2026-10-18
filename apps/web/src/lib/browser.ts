export function buildEmbeddedBrowserUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `/browser?url=${encodeURIComponent(url.toString())}`;
  } catch {
    return null;
  }
}

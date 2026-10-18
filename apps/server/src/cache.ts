export interface Cached<T> {
  data: T;
  /** When the data was fetched from the upstream service (ms epoch). */
  fetchedAt: number;
  /** True when the upstream failed and an older copy is being served. */
  stale: boolean;
}

/**
 * Small TTL cache for external services. Concurrent requests share one upstream call,
 * and an older copy is served (marked stale) if the upstream fails.
 */
export class TtlCache<T> {
  private entries = new Map<string, { data: T; at: number }>();
  private inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxStaleMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** `minRefreshMs` lets a user-forced refresh bypass the TTL, but never hammer the upstream. */
  async get(key: string, load: () => Promise<T>, opts: { force?: boolean; minRefreshMs?: number } = {}): Promise<Cached<T>> {
    const existing = this.entries.get(key);
    const limit = opts.force ? Math.min(this.ttlMs, opts.minRefreshMs ?? this.ttlMs) : this.ttlMs;
    if (existing && this.now() - existing.at < limit) return { data: existing.data, fetchedAt: existing.at, stale: false };

    let pending = this.inflight.get(key);
    if (!pending) {
      pending = load()
        .then((data) => {
          this.entries.set(key, { data, at: this.now() });
          return data;
        })
        .finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    try {
      const data = await pending;
      return { data, fetchedAt: this.entries.get(key)?.at ?? this.now(), stale: false };
    } catch (err) {
      if (existing && this.now() - existing.at < this.maxStaleMs) return { data: existing.data, fetchedAt: existing.at, stale: true };
      throw err;
    }
  }
}
import { randomInt, timingSafeEqual } from "node:crypto";

export type PairResult = { ok: true } | { ok: false; reason: "invalid" | "locked" | "closed"; retryAfterMs: number };

export interface PairingOptions {
  now?: () => number;
  random?: () => number;
  ttlMs?: number;
  maxFailures?: number;
  lockMs?: number;
  maxLockMs?: number;
}

export class Pairing {
  private code = "";
  private expiresAt = 0;
  private failures = 0;
  private lockouts = 0;
  private lockedUntil = 0;
  private active = false;
  private listeners = new Set<() => void>();
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly ttlMs: number;
  private readonly maxFailures: number;
  private readonly lockMs: number;
  private readonly maxLockMs: number;

  constructor(o: PairingOptions = {}) {
    this.now = o.now ?? Date.now;
    this.random = o.random ?? (() => randomInt(0, 10_000));
    this.ttlMs = o.ttlMs ?? 5 * 60_000;
    this.maxFailures = o.maxFailures ?? 5;
    this.lockMs = o.lockMs ?? 60_000;
    this.maxLockMs = o.maxLockMs ?? 15 * 60_000;
  }

  open(): void {
    if (this.active) return;
    this.active = true;
    this.rotate();
  }

  close(): void {
    this.active = false;
    this.code = "";
    this.notify();
  }

  rotate(): void {
    this.code = String(this.random()).padStart(4, "0");
    this.expiresAt = this.now() + this.ttlMs;
    this.failures = 0;
    this.notify();
  }

  current(): { code: string; expiresAt: number } | null {
    if (!this.active) return null;
    if (this.now() >= this.expiresAt) this.rotate();
    return { code: this.code, expiresAt: this.expiresAt };
  }

  attempt(input: string): PairResult {
    if (!this.active) return { ok: false, reason: "closed", retryAfterMs: 0 };
    const t = this.now();
    if (t < this.lockedUntil) return { ok: false, reason: "locked", retryAfterMs: this.lockedUntil - t };
    const cur = this.current();
    const a = Buffer.from(input);
    const b = Buffer.from(cur?.code ?? "");
    if (cur && a.length === b.length && timingSafeEqual(a, b)) {
      this.lockouts = 0;
      this.rotate();
      return { ok: true };
    }
    if (++this.failures >= this.maxFailures) {
      const wait = Math.min(this.lockMs * 2 ** this.lockouts++, this.maxLockMs);
      this.lockedUntil = t + wait;
      this.rotate();
      return { ok: false, reason: "locked", retryAfterMs: wait };
    }
    return { ok: false, reason: "invalid", retryAfterMs: 0 };
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}
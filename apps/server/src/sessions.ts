import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface SessionInfo {
  id: string;
  label: string;
  ip: string | null;
  createdAt: number;
  lastSeen: number;
}

interface Row {
  id: string;
  label: string;
  ip: string | null;
  created_at: number;
  last_seen: number;
}

const DAY = 86_400_000;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const info = (r: Row): SessionInfo => ({ id: r.id, label: r.label, ip: r.ip, createdAt: r.created_at, lastSeen: r.last_seen });

export class SessionStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => number = Date.now,
    private readonly maxAgeMs = 30 * DAY,
    private readonly maxSessions = 20,
  ) {}

  create(label: string, ip: string | null): { token: string; session: SessionInfo } {
    const token = randomBytes(32).toString("base64url");
    const t = this.now();
    const id = randomUUID();
    this.db.prepare("INSERT INTO sessions (id, token_hash, label, ip, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)").run(id, hash(token), label, ip, t, t);
    const extra = this.db.prepare("SELECT id FROM sessions ORDER BY last_seen DESC LIMIT -1 OFFSET ?").all(this.maxSessions) as { id: string }[];
    for (const e of extra) this.revoke(e.id);
    return { token, session: { id, label, ip, createdAt: t, lastSeen: t } };
  }

  verify(token: string): SessionInfo | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(hash(token)) as Row | undefined;
    if (!row) return null;
    const t = this.now();
    if (t - row.last_seen > this.maxAgeMs) {
      this.revoke(row.id);
      return null;
    }
    if (t - row.last_seen > 60_000) {
      this.db.prepare("UPDATE sessions SET last_seen = ? WHERE id = ?").run(t, row.id);
      row.last_seen = t;
    }
    return info(row);
  }

  list(): SessionInfo[] {
    return (this.db.prepare("SELECT * FROM sessions ORDER BY last_seen DESC").all() as unknown as Row[]).map(info);
  }

  revoke(id: string): boolean {
    return Number(this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id).changes) > 0;
  }

  revokeAll(): string[] {
    const ids = this.list().map((s) => s.id);
    this.db.prepare("DELETE FROM sessions").run();
    return ids;
  }
}
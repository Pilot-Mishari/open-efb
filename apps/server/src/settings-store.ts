import type { DatabaseSync } from "node:sqlite";
import { SettingsSchema, defaultSettings, type Settings, type SettingsPatch } from "@open-efb/shared";
import type { Logger } from "pino";

const KEY = "settings";

type Listener = (next: Settings, prev: Settings) => void;

export class SettingsStore {
  private current: Settings;
  private listeners = new Set<Listener>();

  constructor(
    private readonly db: DatabaseSync,
    private readonly log: Logger,
  ) {
    this.current = this.load();
  }

  private load(): Settings {
    const row = this.db.prepare("SELECT value FROM kv WHERE key = ?").get(KEY) as { value: string } | undefined;
    if (!row) return defaultSettings();
    try {
      const parsed = SettingsSchema.safeParse(JSON.parse(row.value));
      if (parsed.success) return parsed.data;
      this.log.warn({ issues: parsed.error.issues }, "stored settings invalid; falling back to defaults");
    } catch (err) {
      this.log.warn({ err }, "stored settings unreadable; falling back to defaults");
    }
    return defaultSettings();
  }

  get(): Settings {
    return this.current;
  }

  /** Merge a validated patch and persist. Throws on invalid result. */
  update(patch: SettingsPatch): Settings {
    const merged = SettingsSchema.parse({
      ...this.current,
      ...patch,
      units: { ...this.current.units, ...(patch.units ?? {}) },
    });
    const prev = this.current;
    this.db
      .prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .run(KEY, JSON.stringify(merged), Date.now());
    this.current = merged;
    for (const l of this.listeners) l(merged, prev);
    return merged;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

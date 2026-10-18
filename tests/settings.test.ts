import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import pino from "pino";
import { SettingsPatchSchema, SettingsSchema, defaultSettings } from "@open-efb/shared";
import { openDatabase } from "../apps/server/src/db";
import { SettingsStore } from "../apps/server/src/settings-store";
import { tmpDir } from "./helpers";

const log = pino({ level: "silent" });
const dirs: string[] = [];
const dir = () => {
  const d = tmpDir();
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("settings schema", () => {

    it("a patch only contains the fields it was given", () => {
    expect(SettingsPatchSchema.parse({ theme: "light" })).toEqual({ theme: "light" });
    expect(SettingsPatchSchema.parse({})).toEqual({});
    expect(SettingsPatchSchema.parse({ units: { altitude: "m" } })).toEqual({ units: { altitude: "m" } });
  });
  it("still validates patch values", () => {
    expect(SettingsPatchSchema.safeParse({ port: 80 }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ units: { speed: "mph" } }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ units: { nope: "x" } }).success).toBe(false);
  });
  
  it("defaults to loopback-only, i.e. LAN access off", () => {
    expect(defaultSettings().lanAccessEnabled).toBe(false);
  });
  it("rejects out-of-range ports and rates", () => {
    expect(SettingsSchema.safeParse({ port: 80 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ port: 70000 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ telemetryRateHz: 100 }).success).toBe(false);
  });
  it("rejects unknown keys in a patch", () => {
    expect(SettingsPatchSchema.safeParse({ nope: true }).success).toBe(false);
  });
});

describe("SettingsStore", () => {
  it("persists across reopen", () => {
    const d = dir();
    const a = new SettingsStore(openDatabase(d), log);
    a.update({ theme: "light", units: { altitude: "m", speed: "kmh", temperature: "F", weight: "lb" } });
    const b = new SettingsStore(openDatabase(d), log);
    expect(b.get().theme).toBe("light");
    expect(b.get().units.altitude).toBe("m");
  });
  it("merges partial unit changes", () => {
    const s = new SettingsStore(openDatabase(dir()), log);
    s.update({ units: { altitude: "m" } as never });
    expect(s.get().units).toEqual({ altitude: "m", speed: "kt", temperature: "C", weight: "kg" });
  });
  it("throws on invalid updates and leaves state untouched", () => {
    const s = new SettingsStore(openDatabase(dir()), log);
    expect(() => s.update({ port: 5 })).toThrow();
    expect(s.get().port).toBe(defaultSettings().port);
  });
  it("falls back to defaults when stored JSON is corrupt", () => {
    const d = dir();
    const db = openDatabase(d);
    db.prepare("INSERT INTO kv (key, value, updated_at) VALUES ('settings', '{broken', 0)").run();
    expect(new SettingsStore(db, log).get()).toEqual(defaultSettings());
  });
  it("falls back to defaults when stored values fail validation", () => {
    const db = openDatabase(dir());
    db.prepare("INSERT INTO kv (key, value, updated_at) VALUES ('settings', '{\"port\": 1}', 0)").run();
    expect(new SettingsStore(db, log).get()).toEqual(defaultSettings());
  });
  it("notifies listeners with next and previous values", () => {
    const s = new SettingsStore(openDatabase(dir()), log);
    const seen: string[] = [];
    s.onChange((n, p) => seen.push(`${p.theme}->${n.theme}`));
    s.update({ theme: "light" });
    expect(seen).toEqual(["dark->light"]);
  });
});

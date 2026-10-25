import { describe, expect, it } from "vitest";
import { SettingsSchema, SettingsPatchSchema, defaultSettings } from "@open-efb/shared";
import { SimWatcher, parseTasklist, simsIn, type SimVariant } from "../apps/desktop/src/sim-watch";

const sample = ['"System Idle Process","0","Services","0","8 K"', '"FlightSimulator.exe","4242","Console","1","4,000,000 K"', '"chrome.exe","1","Console","1","1 K"'].join("\r\n");

function harness(opts: { startPolls?: number; stopPolls?: number } = {}) {
  let procs: ReadonlySet<string> = new Set();
  let fail = false;
  let delay: Promise<void> | null = null;
  let listCalls = 0;
  const events: string[] = [];
  const watcher = new SimWatcher({
    list: async () => {
      listCalls++;
      if (delay) await delay;
      if (fail) throw new Error("tasklist failed");
      return procs;
    },
    onStarted: (v) => events.push(`start:${v.join("+")}`),
    onStopped: () => events.push("stop"),
    ...opts,
  });
  return {
    watcher,
    events,
    set: (...names: string[]) => { procs = new Set(names); },
    failing: (f: boolean) => { fail = f; },
    hold: () => { let release!: () => void; delay = new Promise<void>((r) => { release = r; }); return () => { delay = null; release(); }; },
    calls: () => listCalls,
  };
}

describe("process list parsing", () => {
  it("reads image names from tasklist CSV, case-insensitively", () => {
    const names = parseTasklist(sample);
    expect(names.has("flightsimulator.exe")).toBe(true);
    expect(names.has("chrome.exe")).toBe(true);
    expect(parseTasklist("")).toEqual(new Set());
  });
  it("recognises MSFS 2020 and 2024 and nothing else", () => {
    expect(simsIn(new Set(["flightsimulator.exe"]))).toEqual<SimVariant[]>(["msfs2020"]);
    expect(simsIn(new Set(["flightsimulator2024.exe"]))).toEqual<SimVariant[]>(["msfs2024"]);
    expect(simsIn(new Set(["flightsimulator.exe", "flightsimulator2024.exe"])).sort()).toEqual(["msfs2020", "msfs2024"]);
    expect(simsIn(new Set(["fsuipc7.exe", "notepad.exe"]))).toEqual([]);
  });
});

describe("SimWatcher", () => {
  it("reports a start only after the process has been seen for consecutive polls", async () => {
    const h = harness();
    h.set("flightsimulator.exe");
    await h.watcher.tick();
    expect(h.events).toEqual([]);
    await h.watcher.tick();
    expect(h.events).toEqual(["start:msfs2020"]);
    expect(h.watcher.current()).toEqual(["msfs2020"]);
  });

  it("ignores a one-poll flicker", async () => {
    const h = harness();
    h.set("flightsimulator2024.exe");
    await h.watcher.tick();
    h.set();
    await h.watcher.tick();
    h.set("flightsimulator2024.exe");
    await h.watcher.tick();
    expect(h.events).toEqual([]);
  });

  it("launches once however many polls or processes report the simulator", async () => {
    const h = harness();
    h.set("flightsimulator.exe", "flightsimulator2024.exe");
    for (let i = 0; i < 10; i++) await h.watcher.tick();
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatch(/^start:/);
  });

  it("does not launch again when the simulator version changes within one session", async () => {
    const h = harness();
    h.set("flightsimulator.exe");
    await h.watcher.tick();
    await h.watcher.tick();
    h.set("flightsimulator2024.exe");
    await h.watcher.tick();
    expect(h.events).toEqual(["start:msfs2020"]);
    expect(h.watcher.current()).toEqual(["msfs2024"]);
  });

  it("reports a stop only after several missing polls, then launches again for the next session", async () => {
    const h = harness();
    h.set("flightsimulator.exe");
    await h.watcher.tick();
    await h.watcher.tick();
    h.set();
    await h.watcher.tick();
    await h.watcher.tick();
    expect(h.events).toEqual(["start:msfs2020"]);
    await h.watcher.tick();
    expect(h.events).toEqual(["start:msfs2020", "stop"]);
    expect(h.watcher.current()).toEqual([]);
    h.set("flightsimulator2024.exe");
    await h.watcher.tick();
    await h.watcher.tick();
    expect(h.events).toEqual(["start:msfs2020", "stop", "start:msfs2024"]);
  });

  it("detects a simulator that was already running when the watcher starts", async () => {
    const h = harness({ startPolls: 1 });
    h.set("flightsimulator2024.exe");
    await h.watcher.tick();
    expect(h.events).toEqual(["start:msfs2024"]);
  });

  it("recovers from a failed process check without changing state or crashing", async () => {
    const errors: unknown[] = [];
    let ok = false;
    const events: string[] = [];
    const w = new SimWatcher({
      list: async () => { if (!ok) throw new Error("boom"); return new Set(["flightsimulator.exe"]); },
      onStarted: () => events.push("start"),
      onStopped: () => events.push("stop"),
      onError: (e) => errors.push(e),
    });
    await w.tick();
    await w.tick();
    expect(errors).toHaveLength(2);
    expect(events).toEqual([]);
    ok = true;
    await w.tick();
    await w.tick();
    expect(events).toEqual(["start"]);
  });

  it("keeps a running session when a later check fails", async () => {
    const h = harness();
    h.set("flightsimulator.exe");
    await h.watcher.tick();
    await h.watcher.tick();
    h.failing(true);
    for (let i = 0; i < 5; i++) await h.watcher.tick();
    expect(h.events).toEqual(["start:msfs2020"]);
    expect(h.watcher.current()).toEqual(["msfs2020"]);
  });

  it("never runs two checks at once", async () => {
    const h = harness();
    h.set("flightsimulator.exe");
    const release = h.hold();
    const first = h.watcher.tick();
    await h.watcher.tick();
    await h.watcher.tick();
    expect(h.calls()).toBe(1);
    release();
    await first;
  });

  it("stop() clears state and halts polling; start() is idempotent", async () => {
    const h = harness({ startPolls: 1 });
    h.set("flightsimulator.exe");
    await h.watcher.tick();
    expect(h.watcher.current()).toEqual(["msfs2020"]);
    h.watcher.stop();
    expect(h.watcher.current()).toEqual([]);
    h.watcher.start();
    h.watcher.start();
    h.watcher.stop();
    await new Promise((r) => setTimeout(r, 20));
    expect(h.calls()).toBeLessThanOrEqual(2);
  });
});

describe("simulator launch settings", () => {
  it("default to auto-launch on, start with Windows off", () => {
    const s = defaultSettings();
    expect(s.autoLaunchOnSimulator).toBe(true);
    expect(s.startWithWindows).toBe(false);
  });
  it("settings saved by an older version still load, taking the new defaults", () => {
    const old = { lanAccessEnabled: true, port: 4780, theme: "light", simbriefUser: "pilot" };
    const s = SettingsSchema.parse(old);
    expect(s).toMatchObject({ lanAccessEnabled: true, theme: "light", simbriefUser: "pilot", autoLaunchOnSimulator: true, startWithWindows: false });
  });
  it("accepts boolean patches and rejects other types", () => {
    expect(SettingsPatchSchema.parse({ autoLaunchOnSimulator: false })).toEqual({ autoLaunchOnSimulator: false });
    expect(SettingsPatchSchema.safeParse({ startWithWindows: "yes" }).success).toBe(false);
  });
});

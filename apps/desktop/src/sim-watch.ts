import { execFile } from "node:child_process";

export type SimVariant = "msfs2020" | "msfs2024";

/** Windows image names (lower case) of the simulator executables. Confirm in Task Manager if detection ever fails. */
export const SIM_PROCESSES: Readonly<Record<string, SimVariant>> = {
  "flightsimulator.exe": "msfs2020",
  "flightsimulator2024.exe": "msfs2024",
};

export const SIM_LABEL: Readonly<Record<SimVariant, string>> = { msfs2020: "MSFS 2020", msfs2024: "MSFS 2024" };

/** Image names from `tasklist /FO CSV /NH` output, lower-cased. */
export function parseTasklist(csv: string): Set<string> {
  const names = new Set<string>();
  for (const line of csv.split(/\r?\n/)) {
    const m = /^"([^"]+)"/.exec(line);
    if (m?.[1]) names.add(m[1].toLowerCase());
  }
  return names;
}

export function simsIn(names: ReadonlySet<string>): SimVariant[] {
  const found = new Set<SimVariant>();
  for (const [exe, variant] of Object.entries(SIM_PROCESSES)) if (names.has(exe)) found.add(variant);
  return [...found];
}

/** Running process names. Resolves to an empty set on non-Windows systems. Rejects if tasklist fails. */
export function listProcessNames(): Promise<Set<string>> {
  if (process.platform !== "win32") return Promise.resolve(new Set());
  return new Promise((resolve, reject) => {
    execFile("tasklist", ["/FO", "CSV", "/NH"], { windowsHide: true, timeout: 8000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(parseTasklist(stdout));
    });
  });
}

export interface SimWatchOptions {
  list: () => Promise<ReadonlySet<string>>;
  /** Called once per simulator session, after the process has been seen for `startPolls` polls in a row. */
  onStarted: (variants: SimVariant[]) => void;
  /** Called once, after the process has been missing for `stopPolls` polls in a row. */
  onStopped: () => void;
  onError?: (err: unknown) => void;
  /** Poll interval while waiting for a simulator, and while one is running. */
  idleMs?: number;
  activeMs?: number;
  startPolls?: number;
  stopPolls?: number;
}

/**
 * Polls for the MSFS processes and reports only confirmed start and stop transitions, so duplicate or flickering
 * detections cannot launch the EFB twice. Polls never overlap, and a failed poll leaves the state unchanged.
 */
export class SimWatcher {
  private active = false;
  private busy = false;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private variants: SimVariant[] = [];
  private seen = 0;
  private gone = 0;
  private readonly idleMs: number;
  private readonly activeMs: number;
  private readonly startPolls: number;
  private readonly stopPolls: number;

  constructor(private readonly o: SimWatchOptions) {
    this.idleMs = o.idleMs ?? 5000;
    this.activeMs = o.activeMs ?? 10_000;
    this.startPolls = o.startPolls ?? 2;
    this.stopPolls = o.stopPolls ?? 3;
  }

  /** Confirmed simulator variants, empty when none is running. */
  current(): SimVariant[] {
    return this.running ? [...this.variants] : [];
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.schedule(0);
  }

  stop(): void {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.running = false;
    this.variants = [];
    this.seen = 0;
    this.gone = 0;
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const found = simsIn(await this.o.list());
      if (found.length > 0) {
        this.gone = 0;
        if (this.running) this.variants = found;
        else if (++this.seen >= this.startPolls) {
          this.running = true;
          this.variants = found;
          this.o.onStarted([...found]);
        }
      } else {
        this.seen = 0;
        if (this.running && ++this.gone >= this.stopPolls) {
          this.running = false;
          this.variants = [];
          this.gone = 0;
          this.o.onStopped();
        }
      }
    } catch (err) {
      this.o.onError?.(err);
    } finally {
      this.busy = false;
    }
  }

  private schedule(ms: number): void {
    this.timer = setTimeout(() => {
      void this.tick().then(() => {
        if (this.active) this.schedule(this.running ? this.activeMs : this.idleMs);
      });
    }, ms);
    this.timer.unref();
  }
}

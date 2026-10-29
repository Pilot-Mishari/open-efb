import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import {
  GSX_SERVICE_LABELS,
  emptyGsxStatus,
  type GsxMessage,
  type GsxService,
  type GsxServiceId,
  type GsxStatus,
} from "@open-efb/shared";
import type { Logger } from "pino";
import type { ClientHub } from "./hub";

/**
 * Read-only client for the FSDreamTeam GSX Pro Remote API (v2).
 *
 * GSX Pro hosts a WebSocket server on this computer (default 127.0.0.1:8744, overridable in GSX
 * Settings) and pushes its own state to any client that subscribes. That is the interface GSX
 * documents for third parties and the one other clients such as Fragtality/Any2GSX speak, and it
 * is the only thing this file talks to: there is no second simulator connection, no file scraping
 * of GSX logs, and no write command — the only outbound messages are `subscribe`, `unsubscribe`
 * and the read-only `state.get` refresh.
 *
 * Wire contract, as verified against the reference client:
 *   server -> { v:1, type:"hello", protocol, engine, sim, gsxRunning, authRequired, capabilities[] }
 *   client -> { type:"subscribe", id:"subscribe", channels:[...] }
 *   server -> { type:"result", id:"subscribe", ok }
 *   server -> { type:"snapshot", state, handlerData, services, ... }      then `patch` deltas:
 *             { type:"patch", path:"/services", value:[...] }
 *   server -> { type:"event", topic, model?, gsxRunning? }
 */

export const DEFAULT_GSX_PORT = 8744;

const SERVICE_IDS = new Set<string>(Object.keys(GSX_SERVICE_LABELS));

const TUG_TYPES: Record<number, string> = {
  [-1]: "disabled",
  0: "any",
  1: "towbar",
  2: "towbarless",
  3: "mototok",
};

/* ---------------------------------------------------------------- locating GSX */

/**
 * Reads the Remote-API port out of GSX's own Couatl configuration. The file is GSX's, it may be
 * absent, empty or half-written while GSX starts, so anything unexpected returns null and the
 * caller falls back to the documented default.
 */
export function parseRemotePort(iniText: string): number | null {
  const match = /remote_server_port\s*=\s*(\d{1,5})/i.exec(iniText);
  if (!match) return null;
  const port = Number(match[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

export interface GsxLocator {
  /** Whether GSX Pro looks installed on this computer. */
  installed(): boolean;
  /** Port GSX's Remote API should be listening on. */
  port(): number;
}

/**
 * Locates GSX on the machine running the server. Windows only, because GSX Pro is a Windows
 * add-on; every path stays inside this function so no filesystem path ever reaches a client.
 */
export function localGsxLocator(env: NodeJS.ProcessEnv = process.env): GsxLocator {
  const check = (p: string): boolean => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  };

  const appData = env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const couatlIni = path.join(appData, "Virtuali", "CouatlAddons.ini");
  const addonManager = ["ProgramFiles(x86)", "ProgramFiles"].reduce<string | null>((found, key) => {
    if (found) return found;
    const base = env[key];
    return base ? path.join(base, "Addon Manager") : null;
  }, null);

  const installed = process.platform === "win32" && (check(couatlIni) || (addonManager !== null && check(addonManager)));

  return {
    installed: () => installed,
    port(): number {
      if (!installed) return DEFAULT_GSX_PORT;
      try {
        return parseRemotePort(fs.readFileSync(couatlIni, "utf8")) ?? DEFAULT_GSX_PORT;
      } catch {
        return DEFAULT_GSX_PORT;
      }
    },
  };
}

/* ------------------------------------------------------------------ protocol state */

interface HandlerAirport {
  icao: string;
  name: string | null;
}
interface HandlerGate {
  name: string;
  terminal: string | null;
  pushback: number | null;
  pushbackLabels: string[];
  pushbackAddPos: string[];
  pushbackType: number | null;
}

const asString = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Turns one raw `services` entry into a validated service, or null when GSX's shape is unknown. */
export function parseGsxService(raw: unknown): GsxService | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  if (!id || !SERVICE_IDS.has(id)) return null;
  const stateRaw = asNumber(r.stateRaw);
  return {
    id: id as GsxServiceId,
    stateRaw: stateRaw !== null && stateRaw >= 0 && stateRaw <= 7 ? Math.trunc(stateRaw) : 0,
    canTrigger: r.canTrigger === true,
    operator: asString(r.operator),
    progressText: asString(r.progressText),
  };
}

/**
 * Directions the parking position allows, built exactly the way the reference client builds them:
 * custom GSX position labels first, then LEFT/RIGHT when the parking permits them. This describes
 * the stand, never a selection the pilot made.
 */
export function pushbackDirections(gate: HandlerGate | null): string[] {
  if (!gate) return [];
  const out = gate.pushbackAddPos.filter((s) => s.trim() !== "");
  if (gate.pushback === 1 || gate.pushback === 3) out.push(gate.pushbackLabels[0] ?? "LEFT");
  if (gate.pushback === 2 || gate.pushback === 3) out.push(gate.pushbackLabels[1] ?? "RIGHT");
  return [...new Set(out)];
}

/**
 * Holds everything GSX has told us so far and folds each incoming message into it. Pure: no I/O,
 * no timers, so tests can drive it with recorded frames.
 */
export class GsxState {
  private services = new Map<GsxServiceId, GsxService>();
  private airport: HandlerAirport | null = null;
  private gate: HandlerGate | null = null;
  private aircraft: { icaoType: string | null; isCargo: boolean | null } | null = null;

  protocol: number | null = null;
  engine: string | null = null;
  sim: string | null = null;
  gsxRunning: boolean | null = null;
  capabilities: string[] = [];
  handshakeComplete = false;
  subscribed = false;
  snapshotReceived = false;

  reset(): void {
    this.services.clear();
    this.airport = null;
    this.gate = null;
    this.aircraft = null;
    this.protocol = null;
    this.engine = null;
    this.sim = null;
    this.gsxRunning = null;
    this.capabilities = [];
    this.handshakeComplete = false;
    this.subscribed = false;
    this.snapshotReceived = false;
  }

  /** Applies one decoded message. Returns true when anything the EFB displays actually changed. */
  apply(message: unknown): boolean {
    if (typeof message !== "object" || message === null) return false;
    const m = message as Record<string, unknown>;
    if (m.v !== 1) return false; // an API version we do not understand is ignored, never guessed at

    switch (m.type) {
      case "hello":
        return this.applyHello(m);
      case "snapshot":
        return this.applySnapshot(m);
      case "patch":
        return this.applyPatch(m);
      case "event":
        return this.applyEvent(m);
      case "result":
        if (m.id === "subscribe" && m.ok === true && !this.subscribed) {
          this.subscribed = true;
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  private applyHello(m: Record<string, unknown>): boolean {
    const protocol = asNumber(m.protocol);
    const capabilities = Array.isArray(m.capabilities) ? m.capabilities.filter((c): c is string => typeof c === "string") : [];
    if (protocol === null || protocol < 1 || !asString(m.engine) || capabilities.length === 0) return false;
    this.protocol = protocol;
    this.engine = asString(m.engine);
    this.sim = asString(m.sim);
    this.gsxRunning = m.gsxRunning === true;
    this.capabilities = capabilities;
    this.handshakeComplete = true;
    return true;
  }

  private applySnapshot(m: Record<string, unknown>): boolean {
    if (typeof m.state !== "number") return false;
    // The first snapshot is always a visible event (the EFB now knows GSX delivered real state,
    // so no state.get refresh is owed); later ones report a change only if the fold produced one.
    const first = !this.snapshotReceived;
    this.snapshotReceived = true;
    let changed = this.applyHandlerData(m.handlerData);
    if (this.applyServices(m.services)) changed = true;
    return first || changed;
  }

  private applyPatch(m: Record<string, unknown>): boolean {
    const path = asString(m.path);
    if (!path) return false;
    const key = path.replace(/^\//, "");
    if (key === "services") {
      this.snapshotReceived = true;
      return this.applyServices(m.value);
    }
    if (key === "handlerData") {
      this.snapshotReceived = true;
      return this.applyHandlerData(m.value);
    }
    return false;
  }

  private applyEvent(m: Record<string, unknown>): boolean {
    if (m.gsxRunning === undefined) return false;
    const running = m.gsxRunning === true;
    if (running === this.gsxRunning) return false;
    this.gsxRunning = running;
    return true;
  }

  private applyHandlerData(raw: unknown): boolean {
    if (typeof raw !== "object" || raw === null) return false;
    const h = raw as Record<string, unknown>;

    const nextAirport = this.readAirport(h.airport);
    const nextGate = this.readGate(h.gate);
    const nextAircraft = this.readAircraft(h.aircraft);

    const changed =
      JSON.stringify(nextAirport) !== JSON.stringify(this.airport) ||
      JSON.stringify(nextGate) !== JSON.stringify(this.gate) ||
      JSON.stringify(nextAircraft) !== JSON.stringify(this.aircraft);

    if (nextAirport) this.airport = nextAirport;
    if (nextGate) this.gate = nextGate;
    if (nextAircraft) this.aircraft = nextAircraft;
    return changed;
  }

  private readAirport(raw: unknown): HandlerAirport | null {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const icao = asString(r.icao);
    if (!icao) return null;
    return { icao, name: asString(r.name) };
  }

  private readGate(raw: unknown): HandlerGate | null {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const name = asString(r.uiGateName) ?? asString(r.uiName);
    if (!name) return null;
    const labels = Array.isArray(r.pushbackLabels) ? r.pushbackLabels.filter((s): s is string => typeof s === "string") : [];
    const addPos = Array.isArray(r.pushbackAddPos)
      ? r.pushbackAddPos.flatMap((p) => (typeof p === "object" && p !== null ? [asString((p as Record<string, unknown>).label) ?? ""] : []))
      : [];
    return {
      name,
      terminal: asString(r.uiTerminalName),
      pushback: asNumber(r.pushback),
      pushbackLabels: labels,
      pushbackAddPos: addPos,
      pushbackType: asNumber(r.pushbackType),
    };
  }

  private readAircraft(raw: unknown): { icaoType: string | null; isCargo: boolean | null } | null {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    if (r.icaoType === undefined && r.isCargo === undefined) return null;
    return { icaoType: asString(r.icaoType), isCargo: typeof r.isCargo === "boolean" ? r.isCargo : null };
  }

  private applyServices(raw: unknown): boolean {
    if (!Array.isArray(raw)) return false;
    const next = new Map<GsxServiceId, GsxService>();
    for (const entry of raw) {
      const service = parseGsxService(entry);
      if (service) next.set(service.id, service);
    }
    if (next.size === 0 && this.services.size === 0) return false;
    const changed = JSON.stringify([...next].sort()) !== JSON.stringify([...this.services].sort());
    this.services = next;
    return changed;
  }

  /** Everything the EFB is allowed to see, assembled from what GSX actually sent. */
  status(connection: GsxStatus["connection"], detail: string | null, updatedAt: number | null): GsxStatus {
    const pushback = this.services.get("Departure") ?? null;
    const gate = this.gate;
    const tugType = gate && gate.pushbackType !== null ? (TUG_TYPES[gate.pushbackType] ?? null) : null;
    const directions = pushbackDirections(gate);
    const base = emptyGsxStatus(connection, detail);
    return {
      ...base,
      gsxRunning: this.gsxRunning,
      protocol: this.protocol,
      engine: this.engine,
      sim: this.sim,
      capabilities: this.capabilities,
      airport: this.airport,
      gate: gate ? { name: gate.name, terminal: gate.terminal } : null,
      aircraft: this.aircraft,
      services: [...this.services.values()].sort((a, b) => a.id.localeCompare(b.id)),
      pushback: pushback || directions.length > 0 || tugType !== null ? { directions, tugType, service: pushback } : null,
      updatedAt,
    };
  }

  /** Fingerprint of everything visible, so identical states are never broadcast twice. */
  fingerprint(connection: GsxStatus["connection"], detail: string | null): string {
    const s = this.status(connection, detail, null);
    return JSON.stringify({ ...s, updatedAt: 0 });
  }
}

/* ------------------------------------------------------------------- connection */

export interface GsxManagerOptions {
  hub: ClientHub;
  logger: Logger;
  locator?: GsxLocator;
  /** How long to wait before asking GSX for its state if the first snapshot never arrived. */
  stateRefreshMs?: number;
  /** Injected in tests so no real socket is opened. */
  connect?: (url: string) => WebSocket;
}

const BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000];
const IDLE_TIMEOUT_MS = 90_000;
const PING_INTERVAL_MS = 30_000;
const DEFAULT_STATE_REFRESH_MS = 30_000;

/**
 * Owns the single connection to GSX (however many tablets are watching), reconnects with a capped
 * backoff, and fans state changes out to every WebSocket client. If GSX is missing or says no,
 * it simply parks on an "unavailable"/"unreachable" status — nothing else in the EFB depends on it.
 */
export class GsxManager {
  private state = new GsxState();
  private socket: WebSocket | null = null;
  private running = false;
  private attempt = 0;
  private subscribeSent = false;
  private retry: NodeJS.Timeout | null = null;
  private ping: NodeJS.Timeout | null = null;
  private refresh: NodeJS.Timeout | null = null;
  private lastFingerprint = "";
  private updatedAt: number | null = null;
  private connection: GsxStatus["connection"];
  private detail: string | null;
  private readonly locator: GsxLocator;
  private readonly stateRefreshMs: number;

  constructor(private readonly opts: GsxManagerOptions) {
    const locator = opts.locator ?? localGsxLocator();
    this.locator = locator;
    this.stateRefreshMs = opts.stateRefreshMs ?? DEFAULT_STATE_REFRESH_MS;
    this.connection = locator.installed() ? "connecting" : "unavailable";
    this.detail = locator.installed() ? "Looking for GSX Pro." : "GSX Pro is not installed on this computer.";
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.attempt = 0;
    this.open();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.clearTimers();
    this.subscribeSent = false;
    const socket = this.socket;
    this.socket = null;
    this.state.reset();
    this.setConnection(this.locator.installed() ? "unreachable" : "unavailable", this.locator.installed() ? "GSX link stopped." : "GSX Pro is not installed on this computer.");
    if (!socket) return;
    await new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
      if (socket.readyState === WebSocket.OPEN) socket.close(1000, "efb closing");
      else socket.terminate();
      const guard = setTimeout(() => {
        socket.terminate();
        resolve();
      }, 500);
      guard.unref?.();
    });
  }

  status(): GsxStatus {
    return this.state.status(this.connection, this.detail, this.updatedAt);
  }

  message(): GsxMessage {
    return { type: "gsx", serverTime: Date.now(), gsx: this.status() };
  }

  private open(): void {
    if (!this.running) return;
    if (!this.locator.installed()) {
      this.setConnection("unavailable", "GSX Pro is not installed on this computer.");
      return;
    }

    this.setConnection("connecting", "Connecting to GSX Pro.");
    const url = `ws://127.0.0.1:${this.locator.port()}`;
    let socket: WebSocket;
    try {
      socket = this.opts.connect ? this.opts.connect(url) : new WebSocket(url, { handshakeTimeout: 4_000 });
    } catch (err) {
      this.opts.logger.debug({ err }, "GSX connect failed");
      this.fail("GSX Pro is not answering. Start the simulator and GSX, and keep the Remote control server enabled in GSX Settings.");
      return;
    }
    this.socket = socket;

    let lastSeen = Date.now();
    const touch = () => void (lastSeen = Date.now());

    socket.on("open", () => {
      touch();
      this.opts.logger.debug({ url: "ws://127.0.0.1:****" }, "GSX socket open, waiting for hello");
    });

    socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
      touch();
      const text = Buffer.isBuffer(data) ? data.toString("utf8") : Array.isArray(data) ? Buffer.concat(data).toString("utf8") : Buffer.from(data as ArrayBuffer).toString("utf8");
      let decoded: unknown;
      try {
        decoded = JSON.parse(text);
      } catch {
        return;
      }
      const changed = this.state.apply(decoded);
      this.updatedAt = Date.now();
      // "connected" means the socket is open *and* GSX completed the handshake — the one place
      // the status is allowed to become connected, so a half-open link stays "connecting".
      if (this.state.handshakeComplete && this.connection !== "connected") {
        this.setConnection("connected", null);
      }
      // GSX waits for the client to subscribe after the handshake; this is the only state message
      // we ever send besides a read-only state refresh.
      if (this.state.handshakeComplete && !this.subscribeSent && socket.readyState === WebSocket.OPEN) {
        this.subscribeSent = true;
        socket.send(JSON.stringify({ type: "subscribe", id: "subscribe", channels: ["state", "prompts", "toasts"] }));
      }
      if (this.state.subscribed && !this.refresh) this.scheduleRefresh();
      this.publish(changed);
    });

    socket.on("pong", touch);

    socket.on("error", (err) => this.opts.logger.debug({ err }, "GSX socket error"));

    socket.on("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearTimers();
      this.subscribeSent = false;
      this.state.reset();
      this.updatedAt = null;
      if (!this.running) return;
      this.fail("GSX Pro is not answering. Start the simulator and GSX, and keep the Remote control server enabled in GSX Settings.");
    });

    this.ping = setInterval(() => {
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastSeen > IDLE_TIMEOUT_MS) return socket.terminate();
      socket.ping();
    }, PING_INTERVAL_MS);
    this.ping.unref?.();
  }

  /** GSX pushes on change only, so ask for a full state if the first snapshot never arrived. */
  private scheduleRefresh(): void {
    this.refresh = setTimeout(() => {
      this.refresh = null;
      if (this.socket?.readyState === WebSocket.OPEN && !this.state.snapshotReceived) {
        this.socket.send(JSON.stringify({ type: "command", id: "state.get", verb: "state.get", args: {} }));
      }
    }, this.stateRefreshMs);
    this.refresh.unref?.();
  }

  private fail(detail: string): void {
    this.setConnection("unreachable", detail);
    if (!this.running || this.retry) return;
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]!;
    this.attempt++;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.open();
    }, delay);
    this.retry.unref?.();
  }

  private setConnection(connection: GsxStatus["connection"], detail: string | null): void {
    this.connection = connection;
    this.detail = detail;
    this.publish(true);
  }

  /** Broadcasts only when something visible changed, so a quiet GSX produces no traffic. */
  private publish(changed: boolean): void {
    const fingerprint = this.state.fingerprint(this.connection, this.detail);
    if (!changed && fingerprint === this.lastFingerprint) return;
    this.lastFingerprint = fingerprint;
    this.opts.hub.broadcast(this.message());
  }

  private clearTimers(): void {
    if (this.retry) clearTimeout(this.retry);
    if (this.ping) clearInterval(this.ping);
    if (this.refresh) clearTimeout(this.refresh);
    this.retry = null;
    this.ping = null;
    this.refresh = null;
  }
}

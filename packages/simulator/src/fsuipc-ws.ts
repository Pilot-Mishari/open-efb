import WebSocket from "ws";
import { TelemetryEmitter, emptyValues, type AdapterLogger, type SimulatorAdapter } from "./adapter";
import { convertRaw, looksLikeNoSimData } from "./convert";

/**
 * Offsets read through the FSUIPC WebSocket server (https://fsuipcwebsockets.paulhenty.com).
 * Addresses, sizes and scaling: official FSUIPC4 Offsets Status document.
 * "lat"/"lon" are server-side types that return decimal degrees (confirmed by the server author on the simFlight forum).
 */
export const OFFSETS = [
  { name: "latitude", address: 0x0560, type: "lat", size: 8 },
  { name: "longitude", address: 0x0568, type: "lon", size: 8 },
  { name: "altitude", address: 0x0570, type: "int", size: 8 },
  { name: "groundSpeed", address: 0x02b4, type: "uint", size: 4 },
  { name: "indicatedAirspeed", address: 0x02bc, type: "uint", size: 4 },
  { name: "heading", address: 0x0580, type: "uint", size: 4 },
  { name: "verticalSpeed", address: 0x02c8, type: "int", size: 4 },
  { name: "outsideAirTemp", address: 0x0e8c, type: "int", size: 2 },
  { name: "onGround", address: 0x0366, type: "uint", size: 2 },
] as const;

const SET_NAME = "openEfbTelemetry";
const NOT_REACHABLE = "Cannot reach the FSUIPC WebSocket server. Start FSUIPC7 and its WebSocket server.";

export interface FsuipcWsOptions {
  /** Port of the FSUIPC WebSocket server. The host is always this computer. */
  port: number;
  rateHz: number;
  logger?: AdapterLogger;
  /** Reconnect delay bounds in ms. */
  reconnectMinMs?: number;
  reconnectMaxMs?: number;
  /** If no data arrives for this long while connected, the link is dropped and re-opened. Default max(5 s, 4 sample periods). */
  staleAfterMs?: number;
  now?: () => number;
}

export class FsuipcWsAdapter extends TelemetryEmitter implements SimulatorAdapter {
  readonly source = "fsuipc" as const;
  private port: number;
  private rateHz: number;
  private sock: WebSocket | null = null;
  private wanted = false;
  private declared = false;
  private attempts = 0;
  private lastActivity = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private watchdog: NodeJS.Timeout | null = null;
  private loggedFirstSample = false;
  /** Reason shown after a deliberate drop (error or stale), instead of the generic "cannot reach" text. */
  private failDetail: string | null = null;
  private readonly now: () => number;
  private readonly minMs: number;
  private readonly maxMs: number;

  constructor(private readonly opts: FsuipcWsOptions) {
    super("fsuipc", opts.logger);
    this.port = opts.port;
    this.rateHz = opts.rateHz;
    this.now = opts.now ?? Date.now;
    this.minMs = opts.reconnectMinMs ?? 1000;
    this.maxMs = opts.reconnectMaxMs ?? 15_000;
  }

  async connect(): Promise<void> {
    if (this.wanted) return;
    this.wanted = true;
    this.attempts = 0;
    this.watchdog = setInterval(() => this.checkStale(), 1000);
    this.watchdog.unref();
    this.open();
  }

  async disconnect(): Promise<void> {
    this.wanted = false;
    this.clearTimers();
    this.dropSocket();
    this.publish({ status: "disconnected", detail: "Simulator link stopped" });
  }

  setRateHz(hz: number): void {
    if (hz === this.rateHz) return;
    this.rateHz = hz;
    // Restarting the connection is the safest way to change the read interval.
    if (this.wanted) {
      this.dropSocket();
      this.attempts = 0;
      this.open();
    }
  }

  private get intervalMs(): number {
    return Math.max(50, Math.round(1000 / this.rateHz));
  }

  private open(): void {
    if (!this.wanted || this.sock) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.declared = false;
    this.failDetail = null;
    this.publish({ status: "connecting", detail: `Connecting to the FSUIPC WebSocket server on port ${this.port}` });
    const sock = new WebSocket(`ws://127.0.0.1:${this.port}/fsuipc/`, "fsuipc", { handshakeTimeout: 4000, maxPayload: 1024 * 1024 });
    this.sock = sock;
    this.lastActivity = this.now();

    sock.on("open", () => {
      this.opts.logger?.info({ port: this.port }, "FSUIPC WebSocket connected");
      this.send({ command: "offsets.declare", name: SET_NAME, offsets: OFFSETS });
    });
    sock.on("message", (data) => {
      if (this.sock === sock) this.onMessage(data.toString());
    });
    sock.on("error", (err) => this.opts.logger?.debug({ err: err.message }, "FSUIPC WebSocket error"));
    sock.on("close", () => {
      if (this.sock !== sock) return;
      this.sock = null;
      this.declared = false;
      if (!this.wanted) return;
      this.publish({ status: "disconnected", detail: this.failDetail ?? NOT_REACHABLE });
      this.failDetail = null;
      this.scheduleReconnect();
    });
  }

  private onMessage(text: string): void {
    this.lastActivity = this.now();
    let msg: { command?: string; name?: string; success?: boolean; data?: unknown; errorCode?: unknown; errorMessage?: unknown };
    try {
      msg = JSON.parse(text);
    } catch {
      this.opts.logger?.warn({}, "FSUIPC sent a message that is not JSON");
      return;
    }
    if (msg.success === false) {
      this.opts.logger?.warn({ command: msg.command, errorCode: msg.errorCode, errorMessage: msg.errorMessage }, "FSUIPC WebSocket reported an error");
      this.failDetail = `FSUIPC reported an error: ${String(msg.errorMessage ?? msg.errorCode ?? "unknown")}`;
      this.sock?.terminate(); // close handler publishes the status and schedules the reconnect
      return;
    }
    if (msg.name !== SET_NAME) return;
    if (!this.declared && msg.data === undefined) {
      this.declared = true;
      this.send({ command: "offsets.read", name: SET_NAME, interval: this.intervalMs });
      return;
    }
    if (msg.data && typeof msg.data === "object") {
      this.declared = true;
      this.onSample(msg.data as Record<string, unknown>);
    }
  }

  private onSample(raw: Record<string, unknown>): void {
    if (!this.loggedFirstSample) {
      this.loggedFirstSample = true;
      this.opts.logger?.info({ raw }, "first FSUIPC sample (raw offsets)");
    }
    this.attempts = 0;
    if (looksLikeNoSimData(raw)) {
      this.publish({ status: "connected", detail: "Connected to FSUIPC. Waiting for the simulator to load a flight.", values: emptyValues() });
      return;
    }
    this.publish({ status: "connected", detail: null, updatedAt: this.now(), values: convertRaw(raw) });
  }

  private send(obj: object): void {
    if (this.sock?.readyState === WebSocket.OPEN) this.sock.send(JSON.stringify(obj));
  }

  private checkStale(): void {
    if (!this.sock || !this.wanted) return;
    const limit = this.opts.staleAfterMs ?? Math.max(5000, this.intervalMs * 4);
    if (this.now() - this.lastActivity > limit) {
      this.opts.logger?.warn({ limit }, "no data from FSUIPC, reconnecting");
      this.failDetail = "FSUIPC stopped responding. Reconnecting.";
      this.sock.terminate();
    }
  }

  private scheduleReconnect(): void {
    if (!this.wanted || this.reconnectTimer) return;
    const delay = Math.min(this.minMs * 2 ** this.attempts, this.maxMs);
    this.attempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
    this.reconnectTimer.unref();
  }

  private dropSocket(): void {
    const s = this.sock;
    this.sock = null;
    this.declared = false;
    if (s) {
      s.removeAllListeners("message");
      s.on("error", () => {});
      s.terminate();
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    this.reconnectTimer = this.watchdog = null;
  }
}
import type { TelemetryValues } from "@open-efb/shared";
import { Protocol, SimConnectConstants, SimConnectDataType, SimConnectPeriod, open as openSimConnect, type ConnectionHandle } from "node-simconnect";
import { TelemetryEmitter, emptyValues, type AdapterLogger, type SimulatorAdapter } from "./adapter";

/**
 * Live data straight from the simulator over SimConnect — the same route Volanta and ELEVATEX take,
 * and one Microsoft documents for out-of-process clients. SimConnect ships with MSFS 2020 and 2024,
 * so nothing has to be installed for this to work: no FSUIPC7 and no FSUIPC WebSocket Server.
 *
 * `node-simconnect` speaks the SimConnect protocol in pure TypeScript (no SimConnect.dll is loaded
 * or redistributed); it connects over the named pipe/port MSFS publishes in the registry. The
 * protocol is forward compatible, so one version covers both simulators — the library documents
 * `Protocol.KittyHawk` (MSFS 2020 and 2024) as supported for both.
 *
 * Only read-only simulation variables are requested; nothing is ever written to the simulator.
 * The request has no interval: SimConnect sends every rendered frame and the sample is dropped
 * here if it arrives sooner than the configured rate, which keeps the rate independent of how the
 * library interprets its interval field.
 */

const DEFINITION_ID = 0;
const REQUEST_ID = 0;
const APP_NAME = "Open EFB";
/** One connection attempt (resolving or rejecting) may not take longer than this. */
const CONNECT_TIMEOUT_MS = 8_000;
const WAITING_DETAIL = "Connected with SimConnect. Waiting for the simulator to load a flight.";
const NO_SIM_DETAIL = "Waiting for Microsoft Flight Simulator to start. Nothing else needs to be installed — SimConnect comes with the simulator.";

/** Read in exactly this order; the definition below and the reader in `onSample` must stay aligned. */
const VARIABLES: readonly { name: string; units: string; type: SimConnectDataType }[] = [
  { name: "PLANE LATITUDE", units: "degrees", type: SimConnectDataType.FLOAT64 },
  { name: "PLANE LONGITUDE", units: "degrees", type: SimConnectDataType.FLOAT64 },
  { name: "PLANE ALTITUDE", units: "feet", type: SimConnectDataType.FLOAT64 },
  { name: "GROUND SPEED", units: "knots", type: SimConnectDataType.FLOAT64 },
  { name: "AIRSPEED INDICATED", units: "knots", type: SimConnectDataType.FLOAT64 },
  { name: "PLANE HEADING DEGREES TRUE", units: "degrees", type: SimConnectDataType.FLOAT64 },
  { name: "VERTICAL SPEED", units: "feet per minute", type: SimConnectDataType.FLOAT64 },
  { name: "AMBIENT TEMPERATURE", units: "celsius", type: SimConnectDataType.FLOAT64 },
  { name: "SIM ON GROUND", units: "bool", type: SimConnectDataType.INT32 },
  { name: "COM ACTIVE FREQUENCY:1", units: "MHz", type: SimConnectDataType.FLOAT64 },
  { name: "COM ACTIVE FREQUENCY:2", units: "MHz", type: SimConnectDataType.FLOAT64 },
];

export interface SimConnectOptions {
  rateHz: number;
  logger?: AdapterLogger;
  /** Reconnect delay bounds in ms. */
  reconnectMinMs?: number;
  reconnectMaxMs?: number;
  now?: () => number;
  /** Injection point for tests: same contract as `open` from node-simconnect. */
  connect?: (appName: string, protocol: Protocol) => Promise<{ handle: ConnectionHandle }>;
}

export class SimConnectAdapter extends TelemetryEmitter implements SimulatorAdapter {
  readonly source = "simconnect" as const;
  private rateHz: number;
  private wanted = false;
  private handle: ConnectionHandle | null = null;
  private attempts = 0;
  private epoch = 0;
  private lastEmit = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly now: () => number;
  private readonly minMs: number;
  private readonly maxMs: number;

  constructor(private readonly opts: SimConnectOptions) {
    super("simconnect", opts.logger);
    this.rateHz = opts.rateHz;
    this.now = opts.now ?? Date.now;
    this.minMs = opts.reconnectMinMs ?? 1_000;
    this.maxMs = opts.reconnectMaxMs ?? 15_000;
  }

  async connect(): Promise<void> {
    if (this.wanted) return;
    this.wanted = true;
    this.attempts = 0;
    void this.open();
  }

  async disconnect(): Promise<void> {
    this.wanted = false;
    this.epoch++;
    this.clearTimers();
    this.closeHandle();
    this.publish({ status: "disconnected", detail: "Simulator link stopped" });
  }

  setRateHz(hz: number): void {
    // Samples are throttled as they arrive, so a rate change needs no new connection.
    this.rateHz = hz;
  }

  private get minIntervalMs(): number {
    return Math.max(50, Math.round(1000 / this.rateHz));
  }

  private async open(): Promise<void> {
    if (!this.wanted) return;
    const myEpoch = ++this.epoch;
    this.publish({ status: "connecting", detail: "Connecting with SimConnect (built into MSFS)." });

    let opened: { handle: ConnectionHandle } | null = null;
    try {
      opened = await this.withTimeout(
        this.opts.connect ? this.opts.connect(APP_NAME, Protocol.KittyHawk) : openSimConnect(APP_NAME, Protocol.KittyHawk),
        CONNECT_TIMEOUT_MS,
      );
    } catch (err) {
      this.opts.logger?.debug({ err: err instanceof Error ? err.message : String(err) }, "SimConnect could not connect");
      if (this.wanted && this.epoch === myEpoch) {
        this.publish({ status: "disconnected", detail: NO_SIM_DETAIL });
        this.scheduleReconnect();
      }
      return;
    }
    // A late answer to an attempt the user already cancelled must not resurrect the link.
    if (!this.wanted || this.epoch !== myEpoch) {
      try {
        opened.handle.close();
      } catch {
        /* already closed */
      }
      return;
    }
    this.attach(opened.handle);
  }

  private attach(handle: ConnectionHandle): void {
    this.closeHandle();
    this.handle = handle;

    for (const v of VARIABLES) handle.addToDataDefinition(DEFINITION_ID, v.name, v.units, v.type);
    handle.requestDataOnSimObject(REQUEST_ID, DEFINITION_ID, SimConnectConstants.OBJECT_ID_USER, SimConnectPeriod.VISUAL_FRAME);

    handle.on("simObjectData", (recv) => {
      if (this.handle !== handle || recv.requestID !== REQUEST_ID) return;
      this.onSample(recv.data);
    });
    handle.on("quit", () => this.drop(handle, "The simulator closed."));
    handle.on("close", () => this.drop(handle, NO_SIM_DETAIL));
    handle.on("error", (err) => {
      this.opts.logger?.debug({ err: err.message }, "SimConnect error");
      this.drop(handle, "The SimConnect link dropped. Reconnecting.");
    });
    handle.on("exception", (recv) => this.opts.logger?.debug({ recv }, "SimConnect exception"));

    this.attempts = 0;
    this.opts.logger?.info({ app: APP_NAME }, "SimConnect connected");
    this.publish({ status: "connected", detail: WAITING_DETAIL });
  }

  /** Reads the sample in the same order the definition was built, dropping it if it is too soon. */
  private onSample(data: { readFloat64(): number; readInt32(): number }): void {
    const now = this.now();
    if (now - this.lastEmit < this.minIntervalMs) return;
    this.lastEmit = now;

    const latitudeDeg = data.readFloat64();
    const longitudeDeg = data.readFloat64();
    const altitudeFt = data.readFloat64();
    const groundSpeedKt = data.readFloat64();
    const indicatedAirspeedKt = data.readFloat64();
    const headingTrueDeg = data.readFloat64();
    const verticalSpeedFpm = data.readFloat64();
    const outsideAirTempC = data.readFloat64();
    const onGround = data.readInt32();
    const com1ActiveMhz = data.readFloat64();
    const com2ActiveMhz = data.readFloat64();

    this.attempts = 0;
    // Before a flight is loaded SimConnect still answers, but with no position: report the wait
    // instead of showing 0° 0° as if the aircraft were there.
    if (latitudeDeg === 0 && longitudeDeg === 0) {
      this.publish({ status: "connected", detail: WAITING_DETAIL, values: emptyValues() });
      return;
    }

    const values: TelemetryValues = {
      latitudeDeg,
      longitudeDeg,
      altitudeFt,
      groundSpeedKt,
      indicatedAirspeedKt,
      headingTrueDeg,
      trackTrueDeg: null,
      verticalSpeedFpm,
      outsideAirTempC,
      onGround: onGround !== 0,
      com1ActiveMhz,
      com2ActiveMhz,
    };
    this.publish({ status: "connected", detail: null, updatedAt: now, values });
  }

  private drop(handle: ConnectionHandle, detail: string): void {
    if (this.handle !== handle) return;
    this.handle = null;
    try {
      handle.close();
    } catch {
      /* already closed */
    }
    if (!this.wanted) return;
    this.opts.logger?.debug({}, "SimConnect link closed");
    this.publish({ status: "disconnected", detail });
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.wanted || this.reconnectTimer) return;
    const delay = Math.min(this.minMs * 2 ** this.attempts, this.maxMs);
    this.attempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open();
    }, delay);
    this.reconnectTimer.unref();
  }

  private closeHandle(): void {
    const h = this.handle;
    this.handle = null;
    if (!h) return;
    try {
      h.removeAllListeners("simObjectData");
      h.removeAllListeners("close");
      h.removeAllListeners("quit");
      h.removeAllListeners("error");
      h.close();
    } catch {
      /* already closed */
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  /** Bounds a hanging connect so one stuck attempt can never stall the whole link. */
  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = setTimeout(() => reject(new Error("timeout")), ms);
      id.unref();
      p.then(
        (v) => {
          clearTimeout(id);
          resolve(v);
        },
        (err) => {
          clearTimeout(id);
          reject(err);
        },
      );
    });
  }
}

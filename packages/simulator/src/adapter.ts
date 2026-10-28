import type { SimSource, SimStatus, Telemetry, TelemetryValues } from "@open-efb/shared";

export interface AdapterLogger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
}

/**
 * The only thing the rest of the app knows about a simulator. Nothing FSUIPC-specific
 * (offsets, scaling, message formats) may leak through this interface.
 */
export interface SimulatorAdapter {
  readonly source: SimSource;
  /** Starts the managed connection. Returns immediately; progress is reported through telemetry status. Reconnects on its own. */
  connect(): Promise<void>;
  /** Stops the connection and any reconnect attempts. */
  disconnect(): Promise<void>;
  getStatus(): SimStatus;
  getTelemetrySnapshot(): Telemetry;
  /** The listener gets a fresh snapshot on every status change and every data sample. Returns an unsubscribe function. */
  subscribeToTelemetry(listener: (t: Telemetry) => void): () => void;
  /** Requested sample rate. Takes effect immediately, reconnecting if needed. */
  setRateHz(hz: number): void;
}

export const emptyValues = (): TelemetryValues => ({
  latitudeDeg: null,
  longitudeDeg: null,
  altitudeFt: null,
  groundSpeedKt: null,
  indicatedAirspeedKt: null,
  headingTrueDeg: null,
  trackTrueDeg: null,
  verticalSpeedFpm: null,
  outsideAirTempC: null,
  onGround: null,
  com1ActiveMhz: null,
  com2ActiveMhz: null,
});

export const emptyTelemetry = (source: SimSource | null = null): Telemetry => ({
  source,
  status: "disconnected",
  detail: null,
  updatedAt: null,
  values: emptyValues(),
});

/** Small shared base: holds the current snapshot and notifies subscribers. */
export abstract class TelemetryEmitter {
  protected snapshot: Telemetry;
  private listeners = new Set<(t: Telemetry) => void>();

  protected constructor(source: SimSource, private readonly log?: AdapterLogger) {
    this.snapshot = emptyTelemetry(source);
  }

  getStatus(): SimStatus {
    return this.snapshot.status;
  }

  getTelemetrySnapshot(): Telemetry {
    return { ...this.snapshot, values: { ...this.snapshot.values } };
  }

  subscribeToTelemetry(listener: (t: Telemetry) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Any non-connected state drops all values so stale numbers can never be shown as current. updatedAt is kept for "last update" display. */
  protected publish(next: Partial<Omit<Telemetry, "source">>): void {
    const merged: Telemetry = { ...this.snapshot, ...next };
    if (merged.status !== "connected") merged.values = emptyValues();
    this.snapshot = merged;
    for (const l of this.listeners) {
      try {
        l(this.getTelemetrySnapshot());
      } catch (err) {
        this.log?.warn({ err }, "telemetry listener threw");
      }
    }
  }
}
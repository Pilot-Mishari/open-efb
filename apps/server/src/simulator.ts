import type { Settings, Telemetry, TelemetryMessage } from "@open-efb/shared";
import { FsuipcWsAdapter, MockAdapter, emptyTelemetry, type SimulatorAdapter } from "@open-efb/simulator";
import type { Logger } from "pino";
import type { ClientHub } from "./hub";
import type { SettingsStore } from "./settings-store";

/**
 * Owns the single simulator connection (however many tablets are watching),
 * follows settings changes, and fans telemetry out to every WebSocket client.
 */
export class SimulatorManager {
  private adapter: SimulatorAdapter | null = null;
  private unsubscribe: (() => void) | null = null;
  private running = false;
  private off: () => void;

  /** mock = development only (OPEN_EFB_SIM=mock). It is always labelled as simulated data. */
  constructor(
    private readonly settings: SettingsStore,
    private readonly hub: ClientHub,
    private readonly logger: Logger,
    private readonly mode: "fsuipc" | "mock" = "fsuipc",
  ) {
    this.off = settings.onChange((next, prev) => {
      if (!this.running) return;
      if (next.simulatorEnabled !== prev.simulatorEnabled || next.fsuipcPort !== prev.fsuipcPort) void this.restart();
      else if (next.telemetryRateHz !== prev.telemetryRateHz) this.adapter?.setRateHz(next.telemetryRateHz);
    });
    hub.greeting = () => this.message();
  }

  snapshot(): Telemetry {
    if (this.adapter) return this.adapter.getTelemetrySnapshot();
    const t = emptyTelemetry(null);
    return { ...t, status: "disabled", detail: this.running ? "The simulator link is turned off in Settings." : "Stopped" };
  }

  message(): TelemetryMessage {
    return { type: "telemetry", serverTime: Date.now(), telemetry: this.snapshot() };
  }

  async start(): Promise<void> {
    this.running = true;
    await this.attach(this.settings.get());
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.detach();
  }

  async dispose(): Promise<void> {
    this.off();
    await this.stop();
  }

  private async restart(): Promise<void> {
    await this.detach();
    if (this.running) await this.attach(this.settings.get());
  }

  private async attach(s: Settings): Promise<void> {
    if (!s.simulatorEnabled && this.mode !== "mock") {
      this.hub.broadcast(this.message());
      return;
    }
    const log = { debug: (o: object, m?: string) => this.logger.debug(o, m), info: (o: object, m?: string) => this.logger.info(o, m), warn: (o: object, m?: string) => this.logger.warn(o, m) };
    const adapter = this.mode === "mock" ? new MockAdapter(s.telemetryRateHz) : new FsuipcWsAdapter({ port: s.fsuipcPort, rateHz: s.telemetryRateHz, logger: log });
    if (this.mode === "mock") this.logger.warn({}, "OPEN_EFB_SIM=mock: telemetry is SIMULATED, not from a flight simulator");
    this.adapter = adapter;
    this.unsubscribe = adapter.subscribeToTelemetry(() => this.hub.broadcast(this.message()));
    await adapter.connect();
  }

  private async detach(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    const a = this.adapter;
    this.adapter = null;
    if (a) await a.disconnect();
  }
}
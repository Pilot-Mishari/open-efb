import { TelemetryEmitter, type SimulatorAdapter } from "./adapter";

/**
 * Development and test only. Flies a made-up circle so the UI can be previewed without a simulator.
 * Its telemetry carries source "mock" and the UI must label it as simulated. Enabled only by OPEN_EFB_SIM=mock.
 */
export class MockAdapter extends TelemetryEmitter implements SimulatorAdapter {
  readonly source = "mock" as const;
  private timer: NodeJS.Timeout | null = null;
  private t = 0;

  constructor(private rateHz = 2, private readonly now: () => number = Date.now) {
    super("mock");
  }

  async connect(): Promise<void> {
    if (this.timer) return;
    this.tick();
    this.arm();
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.publish({ status: "disconnected", detail: "Mock simulator stopped" });
  }

  setRateHz(hz: number): void {
    this.rateHz = hz;
    if (this.timer) this.arm();
  }

  private arm(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), Math.round(1000 / this.rateHz));
    this.timer.unref();
  }

  private tick(): void {
    this.t += 1 / this.rateHz;
    const a = (this.t / 120) * 2 * Math.PI;
    this.publish({
      status: "connected",
      detail: "SIMULATED DATA. This is not from a flight simulator.",
      updatedAt: this.now(),
      values: {
        latitudeDeg: 25.25 + 0.5 * Math.sin(a),
        longitudeDeg: 55.36 + 0.5 * Math.cos(a),
        altitudeFt: 35000,
        groundSpeedKt: 450,
        indicatedAirspeedKt: 280,
        headingTrueDeg: (((a * 180) / Math.PI + 90) % 360 + 360) % 360,
        trackTrueDeg: null,
        verticalSpeedFpm: 0,
        outsideAirTempC: -54,
        onGround: false,
        // Simulated radios: a stable COM1/COM2 pair so the automatic ATC listening can be previewed.
        com1ActiveMhz: 119.8,
        com2ActiveMhz: 121.2,
      },
    });
  }
}
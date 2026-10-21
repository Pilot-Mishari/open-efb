import type { Settings, TelemetryValues } from "@open-efb/shared";
import { useSettings } from "../lib/settings-context";
import { useSimState, type SimKind } from "../lib/sim-state";

const DASH = "—";
const FT_TO_M = 0.3048;
const KT_TO_KMH = 1.852;

const num = (v: number | null, digits = 0) => (v === null ? DASH : v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }));

function formatValues(v: TelemetryValues, u: Settings["units"]) {
  const alt = v.altitudeFt === null ? null : u.altitude === "m" ? v.altitudeFt * FT_TO_M : v.altitudeFt;
  const spd = (kt: number | null) => (kt === null ? null : u.speed === "kmh" ? kt * KT_TO_KMH : kt);
  const temp = v.outsideAirTempC === null ? null : u.temperature === "F" ? (v.outsideAirTempC * 9) / 5 + 32 : v.outsideAirTempC;
  const vs = v.verticalSpeedFpm === null ? null : u.altitude === "m" ? v.verticalSpeedFpm * FT_TO_M : v.verticalSpeedFpm;
  return [
    { label: "Altitude (MSL)", value: num(alt), unit: alt === null ? "" : u.altitude },
    { label: "Ground speed", value: num(spd(v.groundSpeedKt)), unit: v.groundSpeedKt === null ? "" : u.speed },
    { label: "Indicated airspeed", value: num(spd(v.indicatedAirspeedKt)), unit: v.indicatedAirspeedKt === null ? "" : u.speed },
    { label: "Heading (true)", value: v.headingTrueDeg === null ? DASH : String(Math.round(v.headingTrueDeg) % 360).padStart(3, "0"), unit: v.headingTrueDeg === null ? "" : "°" },
    { label: "Vertical speed", value: num(vs), unit: vs === null ? "" : u.altitude === "m" ? "m/min" : "ft/min" },
    { label: "Outside air temp", value: num(temp, 0), unit: temp === null ? "" : `°${u.temperature}` },
    { label: "Position", value: v.latitudeDeg === null || v.longitudeDeg === null ? DASH : `${v.latitudeDeg.toFixed(4)}, ${v.longitudeDeg.toFixed(4)}`, unit: "" },
    { label: "On ground", value: v.onGround === null ? DASH : v.onGround ? "Yes" : "No", unit: "" },
  ];
}

const DOT: Record<SimKind, string> = {
  live: "bg-teal", mock: "bg-amber", stale: "bg-amber", "waiting-sim": "bg-amber", connecting: "bg-amber", waiting: "bg-amber",
  disconnected: "bg-alert", "no-link": "bg-alert", disabled: "bg-line",
};

function clock(ms: number | null): string {
  return ms === null ? DASH : `${new Date(ms).toISOString().slice(11, 19)}Z`;
}

/** Source, connection status, last update and the live values. Shows dashes, never guesses, when data is missing. */
export function SimulatorCard() {
  const { settings } = useSettings();
  const sim = useSimState();
  const t = sim.telemetry;
  const rows = formatValues(
    t?.values ?? { latitudeDeg: null, longitudeDeg: null, altitudeFt: null, groundSpeedKt: null, indicatedAirspeedKt: null, headingTrueDeg: null, trackTrueDeg: null, verticalSpeedFpm: null, outsideAirTempC: null, onGround: null },
    settings.units,
  );
  const dim = sim.kind === "stale";
  const last = sim.ageMs === null ? "No data received yet" : `Last update ${clock(Date.now() - sim.ageMs)} · ${Math.round(sim.ageMs / 1000)} s ago`;

  return (
    <section className="col-span-4 rounded-xl border border-line bg-panel" aria-label="Simulator">
      {sim.kind === "mock" && <div role="alert" className="rounded-t-xl bg-amber px-5 py-2 text-center font-semibold text-on-teal">SIMULATED DATA. This is not coming from a flight simulator.</div>}
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-line px-5 py-3" role="status">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${DOT[sim.kind]}`} />
          <h2 className="font-instrument text-xl font-semibold">{sim.label}</h2>
        </div>
        <div className="text-sm text-muted">
          <span>Source: {sim.sourceLabel}</span>
          <span className="mx-2">·</span>
          <span className="num">{last}</span>
        </div>
      </header>
      {sim.detail && sim.kind !== "mock" && <p className="px-5 pt-3 text-muted">{sim.detail}</p>}
      <dl className={`grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-4 ${dim ? "opacity-50" : ""}`}>
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-sm text-muted">{r.label}</dt>
            <dd className={`num text-2xl font-medium ${r.value === DASH ? "text-muted" : ""}`}>
              {r.value}
              {r.unit && <span className="ml-1 text-base text-muted">{r.unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
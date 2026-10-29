import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AirportInfo } from "@open-efb/shared";
import { SeatBadge } from "../components/SeatBadge";
import { useSettings } from "../lib/settings-context";
import { usePlan } from "../lib/plan-context";
import { useSimState } from "../lib/sim-state";
import { buildFlightMapData, formatHeading } from "../lib/flight-map";
import { duration, utcTime } from "../lib/format";
import {
  PHASE_LABEL,
  airportClock,
  deriveFlightPhase,
  elapsedMinutes,
  flightLevel,
  formatPosition,
  liveEta,
  metarTemperatureC,
  nextWaypointLabel,
  type FlightPhase,
} from "../lib/flight-info";

/**
 * Passenger-facing Flight Information screen: planned details from the imported flight plan,
 * live values from simulator telemetry, times in the right zones, and the route with the
 * aircraft's place along it. Everything unavailable shows as "Unavailable" or is omitted —
 * the screen never invents a value, and keeps the mini flight widget (from CabinLayout) visible.
 */

const DASH = "\u2014";
const UNAVAILABLE = "Unavailable";

const PHASE_DOT: Record<FlightPhase, string> = {
  boarding: "bg-amber",
  departed: "bg-teal",
  cruising: "bg-teal",
  approaching: "bg-teal",
  landed: "bg-teal",
  unavailable: "bg-line",
};

function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`rounded-3xl border border-line bg-panel p-6 ${className}`}>
      <h2 className="num mb-4 text-xs uppercase tracking-[0.28em] text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string | null }) {
  const missing = value === UNAVAILABLE;
  return (
    <div className="rounded-2xl border border-line/70 bg-ink px-4 py-3.5">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted">{label}</div>
      <div className={`num mt-1 text-2xl font-semibold ${missing ? "text-muted" : ""}`} dir="ltr">
        {value}
        {unit && !missing && <span className="ms-1.5 text-sm font-normal text-muted">{unit}</span>}
      </div>
      {sub && <div className="num mt-0.5 text-xs text-muted" dir="ltr">{sub}</div>}
    </div>
  );
}

/** One time row with a tag that says where the number comes from: sched / est / actual / live. */
function TimeRow({ label, value, tag }: { label: string; value: string; tag: "sched" | "est" | "actual" | "live" }) {
  const missing = value === UNAVAILABLE || value === DASH;
  const tagTone = tag === "actual" && missing ? "border-line text-muted" : tag === "live" ? "border-teal/60 text-teal" : tag === "sched" ? "border-line text-muted" : "border-line text-text";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/50 py-2.5 last:border-0">
      <span className="text-sm text-muted">
        {label}
        <span className={`ms-2 rounded-full border px-1.5 py-px text-[9px] uppercase tracking-[0.16em] ${tagTone}`}>{tag}</span>
      </span>
      <span className={`num text-lg ${missing ? "text-muted" : ""}`} dir="ltr">{value}</span>
    </div>
  );
}

function airportCode(airport: AirportInfo | null): string {
  return airport?.icao ?? airport?.iata ?? UNAVAILABLE;
}

function tempText(celsius: number | null, unit: "C" | "F"): string {
  if (celsius === null) return UNAVAILABLE;
  const value = unit === "F" ? (celsius * 9) / 5 + 32 : celsius;
  return `${Math.round(value)}°${unit}`;
}

export function CabinFlightInformationPage() {
  const { plan, status: planStatus, error: planError } = usePlan();
  const sim = useSimState();
  const { settings } = useSettings();
  const [now, setNow] = useState(() => Date.now());

  // One ticking clock drives every "now" value: local times, UTC, elapsed and live ETA.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const mapData = useMemo(() => buildFlightMapData(plan, sim), [plan, sim]);
  const fresh = sim.kind === "live" || sim.kind === "mock";
  const v = fresh ? sim.telemetry?.values ?? null : null;
  const hasRoute = mapData.route.length >= 2;
  const phase = deriveFlightPhase({
    fresh,
    onGround: v?.onGround ?? null,
    groundSpeedKt: v?.groundSpeedKt ?? null,
    progress: mapData.progress,
    hasRoute,
  });

  const airborne = v !== null && v.onGround === false;
  const eta = liveEta({ airborne, groundSpeedKt: v?.groundSpeedKt ?? null, remainingNm: mapData.remainingNm, nowMs: now });
  const elapsed = elapsedMinutes(phase, plan, now);
  const nextWaypoint = nextWaypointLabel(mapData, plan?.destination.icao ?? null);
  const position = formatPosition(v?.latitudeDeg ?? null, v?.longitudeDeg ?? null);
  const fl = flightLevel(v?.altitudeFt ?? null);

  const departure = plan?.origin ?? null;
  const destination = plan?.destination ?? null;
  const depLocal = airportClock(departure, new Date(now));
  const destLocal = airportClock(destination, new Date(now));
  const utcNow = new Date(now).toISOString().slice(11, 16);
  const destTemp = metarTemperatureC(destination?.metar ?? null);
  const arrivalRunway = destination?.runway ?? null;

  const progressPct = hasRoute ? Math.min(100, Math.max(0, Math.round(mapData.progress))) : null;
  const distanceUnit = "nm";
  const altValue = v?.altitudeFt == null ? UNAVAILABLE : settings.units.altitude === "m" ? `${Math.round(v.altitudeFt * 0.3048).toLocaleString("en-US")}` : `${Math.round(v.altitudeFt).toLocaleString("en-US")}`;
  const speedValue = v?.groundSpeedKt == null ? UNAVAILABLE : settings.units.speed === "kmh" ? `${Math.round(v.groundSpeedKt * 1.852)}` : `${Math.round(v.groundSpeedKt)}`;
  const speedUnit = v === null ? "" : settings.units.speed === "kmh" ? "km/h" : "kt";
  const vsValue = v?.verticalSpeedFpm == null ? UNAVAILABLE : settings.units.altitude === "m" ? `${Math.round(v.verticalSpeedFpm * 0.3048)}` : `${Math.round(v.verticalSpeedFpm)}`;
  const vsUnit = v === null ? "" : settings.units.altitude === "m" ? "m/min" : "ft/min";
  const oatValue = v?.outsideAirTempC == null ? UNAVAILABLE : tempText(v.outsideAirTempC, settings.units.temperature);

  const flightLabel = plan?.flightNumber ?? plan?.callsign ?? UNAVAILABLE;
  const shown = (value: string | null | undefined): string => (value && value !== DASH ? value : UNAVAILABLE);

  return (
    <div className="relative h-full overflow-y-auto px-5 py-6 pb-32 sm:px-8 lg:px-10">
      <SeatBadge />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="pe-32 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/cabin/home" className="rounded-lg border border-line bg-panel px-3.5 py-1.5 text-sm text-muted hover:bg-panel-hi">Back home</Link>
            <span className="num text-xs uppercase tracking-[0.3em] text-muted">Flight information</span>
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1" dir="ltr">
            <h1 className="font-instrument text-5xl font-semibold leading-none">{flightLabel}</h1>
            {plan?.callsign && plan.flightNumber && plan.callsign !== plan.flightNumber && (
              <span className="num text-xl text-muted">{plan.callsign}</span>
            )}
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-muted">
            {plan?.airline && <span className="text-text">{plan.airline}</span>}
            {plan?.airline && <span aria-hidden="true">·</span>}
            <span dir="ltr">{shown(plan?.aircraft.name ?? plan?.aircraft.icao)}</span>
            {plan?.aircraft.registration && (
              <>
                <span aria-hidden="true">·</span>
                <span className="num" dir="ltr">{plan.aircraft.registration}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3 rounded-full border border-line bg-panel px-5 py-2.5" role="status">
            <span className={`h-2.5 w-2.5 rounded-full ${PHASE_DOT[phase]}`} aria-hidden="true" />
            <span className="font-instrument text-2xl font-semibold">{PHASE_LABEL[phase]}</span>
          </div>
          <div className="flex items-center gap-2">
            {sim.kind === "mock" && (
              <span className="rounded-full border border-amber/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber">Simulated data</span>
            )}
            {!fresh && <span className="rounded-full border border-amber/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber">{sim.label}</span>}
          </div>
        </div>
      </header>

      {!plan && (
        <p className="mt-6 rounded-2xl border border-dashed border-line bg-panel px-5 py-4 text-base text-muted" role="status">
          {planStatus === "error" && planError
            ? `Flight plan unavailable: ${planError}.`
            : "No flight plan loaded — set your SimBrief username in Settings to show planned times, route and progress."}{" "}
          Live values below still come from the simulator.
        </p>
      )}

      {/* ── Route band ─────────────────────────────────────────── */}
      <div className="mt-6 rounded-3xl border border-line bg-panel p-6">
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_minmax(16rem,1.2fr)_1fr]">
          {/* Departure */}
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.28em] text-muted">Departure</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-3" dir="ltr">
              <span className="font-instrument text-5xl font-semibold leading-none">{airportCode(departure)}</span>
              {departure?.iata && departure.icao && <span className="num text-lg text-muted">{departure.iata}</span>}
            </div>
            <p className="mt-1 truncate text-base text-muted" title={departure?.name ?? ""}>{shown(departure?.name)}</p>
            <div className="mt-3">
              <TimeRow label="Scheduled" value={utcTime(plan?.times.scheduledOut)} tag="sched" />
              <TimeRow label="Estimated" value={utcTime(plan?.times.estimatedOut)} tag="est" />
              <TimeRow label="Actual" value={UNAVAILABLE} tag="actual" />
            </div>
          </div>

          {/* Progress */}
          <div className="min-w-0 text-center">
            <div className="text-[11px] uppercase tracking-[0.28em] text-muted">Flight progress</div>
            <div className="num mt-2 font-instrument text-7xl font-light leading-none" dir="ltr">
              {progressPct === null ? <span className="text-4xl text-muted">{UNAVAILABLE}</span> : `${progressPct}%`}
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink" dir="ltr" aria-hidden="true">
              <div
                className="h-full rounded-full bg-teal transition-[width] duration-700"
                style={{ width: `${progressPct ?? 0}%` }}
              />
            </div>
            <div className="num mt-3 flex justify-between gap-4 text-sm text-muted" dir="ltr">
              <span>{hasRoute ? `${Math.round(mapData.travelledNm).toLocaleString("en-US")} ${distanceUnit} flown` : UNAVAILABLE}</span>
              <span>{hasRoute ? `${Math.round(mapData.remainingNm).toLocaleString("en-US")} ${distanceUnit} to go` : UNAVAILABLE}</span>
            </div>
            <div className="mt-2 text-sm text-muted">
              Total {hasRoute && plan?.distanceNm != null ? `${Math.round(plan.distanceNm).toLocaleString("en-US")} ${distanceUnit}` : UNAVAILABLE}
            </div>
          </div>

          {/* Destination */}
          <div className="min-w-0 lg:text-end">
            <div className="text-[11px] uppercase tracking-[0.28em] text-muted">Destination</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-3 lg:justify-end" dir="ltr">
              <span className="font-instrument text-5xl font-semibold leading-none">{airportCode(destination)}</span>
              {destination?.iata && destination.icao && <span className="num text-lg text-muted">{destination.iata}</span>}
            </div>
            <p className="mt-1 truncate text-base text-muted" title={destination?.name ?? ""}>{shown(destination?.name)}</p>
            <div className="mt-3">
              <TimeRow label="Scheduled" value={UNAVAILABLE} tag="sched" />
              <TimeRow label="Estimated" value={utcTime(plan?.times.estimatedIn)} tag="est" />
              <TimeRow
                label={eta ? "Live ETA" : "Actual"}
                value={eta ? utcTime(new Date(eta.etaMs).toISOString()) : UNAVAILABLE}
                tag={eta ? "live" : "actual"}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Live status ────────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <Stat label="Altitude" value={altValue} unit={v === null ? "" : settings.units.altitude === "m" ? "m" : "ft"} sub={fl} />
        <Stat label="Ground speed" value={speedValue} unit={speedUnit} />
        <Stat label="Heading" value={v ? formatHeading(v.headingTrueDeg) : UNAVAILABLE} />
        <Stat label="Vertical speed" value={vsValue} unit={vsUnit} />
        <Stat label="Time remaining" value={eta ? duration(eta.eteMinutes) : UNAVAILABLE} sub={eta ? "live estimate" : null} />
        <Stat label="ETA" value={eta ? utcTime(new Date(eta.etaMs).toISOString()) : plan?.times.estimatedIn ? `${utcTime(plan.times.estimatedIn)}` : UNAVAILABLE} sub={eta ? "live estimate" : plan?.times.estimatedIn ? "planned" : null} />
        <Stat
          label="Elapsed flight time"
          value={
            elapsed !== null
              ? duration(elapsed)
              : phase === "landed" && plan?.times.enrouteMinutes != null
                ? duration(plan.times.enrouteMinutes)
                : UNAVAILABLE
          }
          sub={elapsed !== null ? "since departure (est.)" : phase === "landed" && plan?.times.enrouteMinutes != null ? "planned" : null}
        />
        <Stat label="Outside air temp." value={oatValue} />
      </div>

      {/* ── Times & weather | route ────────────────────────────── */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Times & weather">
          <div className="flex items-baseline justify-between gap-3 border-b border-line/50 py-2.5">
            <span className="text-sm text-muted">Departure airport local time</span>
            <span className={`num text-xl ${depLocal ? "" : "text-muted"}`} dir="ltr">{depLocal ?? UNAVAILABLE}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-b border-line/50 py-2.5">
            <span className="text-sm text-muted">Destination airport local time</span>
            <span className={`num text-xl ${destLocal ? "" : "text-muted"}`} dir="ltr">{destLocal ?? UNAVAILABLE}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-b border-line/50 py-2.5">
            <span className="text-sm text-muted">Current UTC (Zulu)</span>
            <span className="num text-xl" dir="ltr">{utcNow}Z</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-b border-line/50 py-2.5">
            <span className="text-sm text-muted">Arrival runway</span>
            <span className={`num text-xl ${arrivalRunway ? "" : "text-muted"}`} dir="ltr">{arrivalRunway ?? UNAVAILABLE}</span>
          </div>
          <div className="mt-3 rounded-2xl border border-line/70 bg-ink px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.22em] text-muted">Destination weather (METAR)</span>
              <span className="num text-lg" dir="ltr">{tempText(destTemp, settings.units.temperature)}</span>
            </div>
            <p className="num mt-1.5 break-words text-sm leading-relaxed text-text" dir="ltr">
              {destination?.metar ?? UNAVAILABLE}
            </p>
          </div>
        </Panel>

        <Panel title="Route">
          {!plan ? (
            <p className="text-base text-muted">{planError ? `Flight plan unavailable: ${planError}` : "No flight plan loaded, so there is no route to show."}</p>
          ) : (
            <>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                <div className="flex items-baseline justify-between gap-3 border-b border-line/50 py-2">
                  <dt className="text-sm text-muted">Position</dt>
                  <dd className="num text-base" dir="ltr">{position ?? UNAVAILABLE}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-line/50 py-2">
                  <dt className="text-sm text-muted">Next waypoint</dt>
                  <dd className="num text-base" dir="ltr">{nextWaypoint ?? UNAVAILABLE}</dd>
                </div>
              </dl>

              <div className="mt-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-muted">Cleared route</div>
                <p className="mt-1 break-words text-base leading-relaxed text-text" dir="ltr">{shown(plan.route)}</p>
              </div>

              {plan.navlog.length > 0 && (
                <div className="mt-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-muted">Waypoints ({plan.navlog.length})</div>
                  <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto pe-1">
                    {plan.navlog.map((fix, i) => (
                      <li key={`${fix.ident}-${i}`} className="flex items-baseline justify-between gap-3 rounded-lg bg-ink px-3 py-1.5" dir="ltr">
                        <span className="num text-base text-text">{fix.ident}</span>
                        <span className="text-xs text-muted">
                          {fix.airway ?? ""}
                          {fix.stage ? ` · ${fix.stage}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/50 pt-4">
                <span className="text-sm text-muted">Full route on the live map</span>
                <Link to="/cabin/map" className="rounded-lg border border-line bg-panel-hi px-4 py-2 text-base text-text hover:bg-panel">Open flight map</Link>
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

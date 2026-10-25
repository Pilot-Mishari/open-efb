import { Icon } from "../lib/icons";
import { amount, utcTime } from "../lib/format";
import { usePlan } from "../lib/plan-context";

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="text-right">
    <dt className="text-sm text-muted">{label}</dt>
    <dd className={`num text-2xl font-medium ${value === "\u2014" ? "text-muted" : ""}`}>{value}</dd>
  </div>
);

/** Persistent flight strip, filled from the latest SimBrief plan. */
export function FlightHeader() {
  const { plan, status, stale } = usePlan();
  const dash = "\u2014\u2014\u2014\u2014";
  const title = plan ? [plan.callsign ?? plan.flightNumber ?? "Flight plan", plan.aircraft.icao].filter(Boolean).join(" \u00b7 ") : status === "loading" ? "Loading flight plan" : "No flight loaded";
  const sub = plan
    ? stale ? "SimBrief unreachable, showing the last plan" : "From your latest SimBrief plan"
    : status === "unset" ? "Set your SimBrief username in Settings" : status === "error" ? "Could not load the SimBrief plan" : "Contacting SimBrief";

  return (
    <header className="flex items-center gap-8 border-b border-line bg-panel px-8 py-3">
      <div className="min-w-48">
        <div className="font-instrument text-2xl font-semibold">{title}</div>
        <div className={`text-sm ${stale ? "text-amber" : "text-muted"}`}>{sub}</div>
      </div>
      <div className="flex flex-1 items-center gap-3 text-muted" aria-label={plan ? `${plan.origin.icao} to ${plan.destination.icao}` : "Route not set"}>
        <span className={`num text-3xl ${plan ? "text-text" : ""}`}>{plan?.origin.icao ?? dash}</span>
        <span className="h-px flex-1 border-t-2 border-dashed border-line" />
        <Icon name="cabin" className="h-6 w-6 rotate-90 text-teal" />
        <span className="h-px flex-1 border-t-2 border-dashed border-line" />
        <span className={`num text-3xl ${plan ? "text-text" : ""}`}>{plan?.destination.icao ?? dash}</span>
      </div>
      <dl className="flex gap-8">
        <Stat label="Departs" value={utcTime(plan?.times.scheduledOut ?? plan?.times.estimatedOut)} />
        <Stat label="Arrives" value={utcTime(plan?.times.estimatedIn)} />
        <Stat label="Distance" value={plan?.distanceNm == null ? "\u2014" : amount(plan.distanceNm, "nm")} />
      </dl>
    </header>
  );
}
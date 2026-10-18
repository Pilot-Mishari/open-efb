import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AirportInfo, FlightPlan } from "@open-efb/shared";
import { EmptyState, Panel, SectionLayout } from "../components/Panel";
import { buildEmbeddedBrowserUrl } from "../lib/browser";
import { amount, duration, utcDateTime, utcTime } from "../lib/format";
import { MODULES } from "../lib/modules";
import { usePlan } from "../lib/plan-context";

const Rows = ({ rows }: { rows: [string, ReactNode][] }) => (
  <dl className="divide-y divide-line">
    {rows.map(([k, v]) => (
      <div key={k} className="flex justify-between gap-6 py-2.5 text-lg">
        <dt className="text-muted">{k}</dt>
        <dd className="num text-right">{v ?? "\u2014"}</dd>
      </div>
    ))}
  </dl>
);
const val = (v: string | number | null | undefined, suffix = "") => (v === null || v === undefined || v === "" ? "\u2014" : `${v}${suffix}`);
const Raw = ({ label, text }: { label: string; text: string | null }) => (
  <div className="mt-4">
    <div className="text-sm text-muted">{label}</div>
    <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-ink p-3 font-mono text-base">{text ?? "Not included in this plan"}</pre>
  </div>
);

function AirportPanel({ title, a }: { title: string; a: AirportInfo }) {
  return (
    <Panel title={title} note={[a.icao, a.iata].filter(Boolean).join(" / ")}>
      <Rows rows={[["Name", val(a.name)], ["Planned runway", val(a.runway)], ["Elevation", a.elevationFt === null ? "\u2014" : amount(a.elevationFt, "ft")]]} />
      <Raw label="METAR in plan" text={a.metar} />
      <Raw label="TAF in plan" text={a.taf} />
    </Panel>
  );
}

function Body({ plan, section }: { plan: FlightPlan; section: string }) {
  const u = plan.units;
  switch (section) {
    case "Departure":
      return <AirportPanel title="Departure" a={plan.origin} />;
    case "Arrival":
      return (
        <>
          <AirportPanel title="Arrival" a={plan.destination} />
          {plan.alternate && <AirportPanel title="Alternate" a={plan.alternate} />}
        </>
      );
    case "Route":
      return (
        <>
          <Panel title="Route string"><p className="num text-lg">{plan.route ?? "\u2014"}</p></Panel>
          <Panel title="Navlog" note={`${plan.navlog.length} points`}>
            {plan.navlog.length === 0 ? <EmptyState title="No navlog in this plan" hint="Generate the plan in SimBrief with the detailed navlog option." /> : (
              <div className="max-h-[28rem] overflow-y-auto">
                <table className="w-full text-lg">
                  <thead className="sticky top-0 bg-panel text-left text-sm text-muted"><tr><th className="py-2">Point</th><th>Airway</th><th className="text-right">Altitude</th><th className="text-right">Phase</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {plan.navlog.map((f, i) => (
                      <tr key={`${f.ident}-${i}`}><td className="num py-2 font-medium">{f.ident}</td><td className="num text-muted">{f.airway ?? "\u2014"}</td><td className="num text-right">{f.altitudeFt === null ? "\u2014" : amount(f.altitudeFt, "ft")}</td><td className="text-right text-muted">{f.stage ?? "\u2014"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      );
    case "Fuel and weight":
      return (
        <div className="grid grid-cols-2 gap-4">
          <Panel title="Fuel" note={u ?? "unit not stated"}>
            <Rows rows={[["Taxi", amount(plan.fuel.taxi)], ["Trip", amount(plan.fuel.enrouteBurn)], ["Contingency", amount(plan.fuel.contingency)], ["Alternate", amount(plan.fuel.alternate)], ["Reserve", amount(plan.fuel.reserve)], ["Block (ramp)", amount(plan.fuel.planRamp)], ["Takeoff", amount(plan.fuel.planTakeoff)], ["Landing", amount(plan.fuel.planLanding)]]} />
          </Panel>
          <Panel title="Weights" note={u ?? "unit not stated"}>
            <Rows rows={[["Passengers", val(plan.weights.pax)], ["Payload", amount(plan.weights.payload)], ["Zero fuel", amount(plan.weights.zfw)], ["Takeoff", amount(plan.weights.tow)], ["Landing", amount(plan.weights.ldw)], ["Max zero fuel", amount(plan.weights.maxZfw)], ["Max takeoff", amount(plan.weights.maxTow)], ["Max landing", amount(plan.weights.maxLdw)]]} />
          </Panel>
        </div>
      );
    case "OFP":
      return (
        <Panel title="Operational flight plan">
          {plan.pdfUrl ? (
            <Link to={buildEmbeddedBrowserUrl(plan.pdfUrl) ?? "/"} className="inline-block rounded-lg bg-teal px-6 py-3 text-lg font-semibold text-on-teal">Open the OFP PDF in the EFB</Link>
          ) : <EmptyState title="No PDF link in this plan" hint="SimBrief did not include a PDF for your latest plan." />}
          <p className="mt-3 text-sm text-muted">Opens inside the EFB browser instead of in a separate tab.</p>
        </Panel>
      );
    default:
      return (
        <div className="grid grid-cols-2 gap-4">
          <Panel title="Flight">
            <Rows rows={[["Callsign", val(plan.callsign)], ["Aircraft", [plan.aircraft.icao, plan.aircraft.registration].filter(Boolean).join(" ") || "\u2014"], ["Cruise level", plan.cruiseAltitudeFt === null ? "\u2014" : `FL${Math.round(plan.cruiseAltitudeFt / 100)}`], ["Cost index", val(plan.costIndex)], ["Distance", plan.distanceNm === null ? "\u2014" : amount(plan.distanceNm, "nm")]]} />
          </Panel>
          <Panel title="Times (UTC)">
            <Rows rows={[["Scheduled out", utcTime(plan.times.scheduledOut)], ["Estimated out", utcTime(plan.times.estimatedOut)], ["Estimated in", utcTime(plan.times.estimatedIn)], ["Time en route", duration(plan.times.enrouteMinutes)]]} />
          </Panel>
          <Panel title="Source" className="col-span-2">
            <Rows rows={[["Plan generated", utcDateTime(plan.generatedAt)], ["AIRAC cycle", val(plan.airac)], ["Fetched by Open EFB", new Date(plan.fetchedAt).toLocaleTimeString()]]} />
          </Panel>
        </div>
      );
  }
}

export function BriefingPage() {
  const sections = MODULES.find((m) => m.id === "briefing")?.sections ?? [];
  const [section, setSection] = useState(sections[0] ?? "Overview");
  const { plan, status, stale, error, reload } = usePlan();

  let content: ReactNode;
  if (plan) content = <Body plan={plan} section={section} />;
  else if (status === "unset") content = <EmptyState title="No SimBrief username set" hint="Add your SimBrief username or Pilot ID in Settings, under Integrations, and your latest plan loads automatically." />;
  else if (status === "error") content = <EmptyState title="Could not load your plan" hint={error ?? "Try again in a moment."} />;
  else content = <EmptyState title="Loading your latest plan" hint="Asking SimBrief for your most recent flight." />;

  return (
    <SectionLayout sections={sections} active={section} onSelect={setSection}>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-instrument text-4xl font-semibold">Briefing</h1>
        <div className="flex items-center gap-3">
          {stale && <span className="text-sm text-amber">SimBrief unreachable, showing the last plan</span>}
          {status === "unset" ? <Link to="/settings" className="rounded-lg border border-line px-4 py-2.5 text-lg">Open settings</Link> : (
            <button onClick={() => void reload(true)} disabled={status === "loading"} className="min-h-12 rounded-lg border border-line px-5 text-lg disabled:opacity-50">{status === "loading" ? "Loading\u2026" : "Refresh plan"}</button>
          )}
        </div>
      </div>
      {plan && error && <p role="alert" className="text-alert">{error}</p>}
      {content}
    </SectionLayout>
  );
}
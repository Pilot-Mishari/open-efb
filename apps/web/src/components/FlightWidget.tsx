import { useState } from "react";
import { deriveFlightWidget, NOT_AVAILABLE, type WidgetTone } from "../lib/flight-widget";
import { usePlan } from "../lib/plan-context";
import { useSimState } from "../lib/sim-state";

const DOT: Record<WidgetTone, string> = { live: "bg-teal", warn: "bg-amber", off: "bg-line" };

const Row = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-[0.2em] text-muted">{label}</dt>
    <dd className={`num leading-tight ${value === NOT_AVAILABLE ? "text-lg font-medium text-muted" : "text-2xl font-semibold"}`}>{value}</dd>
  </div>
);

/** Compact flight status card for CabinView. Reads the shared plan and simulator state, shows nothing it did not receive. */
export function FlightWidget() {
  const { plan } = usePlan();
  const sim = useSimState();
  const [open, setOpen] = useState(true);
  const d = deriveFlightWidget(plan, sim);

  return (
    <aside aria-label="Flight status" className="flex shrink-0 items-center justify-center p-4 md:pl-0 md:pr-6">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-panel/80 p-4 backdrop-blur md:w-60">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[d.tone]}`} aria-hidden="true" />
          <span role="status" className="min-w-0 flex-1 truncate text-sm text-muted">{d.status}</span>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Collapse flight status" : "Expand flight status"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-hi hover:text-text">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-5 w-5 ${open ? "" : "rotate-180"}`} aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
          </button>
        </div>
        {!open && (
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="num text-xl font-semibold">{d.flight}</span>
            <span className="num text-lg">{d.altitude}</span>
          </div>
        )}
        {open && (
          <>
            <dl className="mt-3 space-y-3">
              <Row label="Flight" value={d.flight} />
              <Row label="ETA" value={d.eta} />
              <Row label="Altitude" value={d.altitude} />
              {d.groundSpeed && <Row label="Ground speed" value={d.groundSpeed} />}
            </dl>
            {d.simulated && <p className="mt-3 text-xs font-medium uppercase tracking-wider text-amber">Simulated data</p>}
          </>
        )}
      </div>
    </aside>
  );
}
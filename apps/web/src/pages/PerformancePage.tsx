import { EmptyState, Panel, PreviewNote } from "../components/Panel";

const SPEEDS = ["V1", "VR", "V2"];
const FIELD = ({ label }: { label: string }) => (
  <label className="block">
    <span className="text-sm text-muted">{label}</span>
    <input disabled placeholder="—" className="mt-1 block w-full rounded-lg border border-line bg-ink px-3 py-2.5 text-lg disabled:opacity-60" />
  </label>
);

export function PerformancePage() {
  return (
    <div className="space-y-4">
      <h1 className="font-instrument text-4xl font-semibold">Performance</h1>
      <div className="grid grid-cols-[18rem_1fr] gap-4">
        <Panel title="Inputs">
          <div className="space-y-3">
            <FIELD label="Aircraft profile" />
            <FIELD label="Runway" />
            <FIELD label="Wind" />
            <FIELD label="Temperature" />
            <FIELD label="Pressure" />
          </div>
        </Panel>
        <div className="space-y-4">
          <section className="rounded-xl border border-line bg-panel p-6" aria-label="Takeoff speeds">
            <div className="grid grid-cols-3 divide-x divide-line">
              {SPEEDS.map((s) => (
                <div key={s} className="px-6 text-center">
                  <div className="text-lg text-muted">{s}</div>
                  <div className="num text-8xl font-semibold text-muted" aria-label="not calculated">&mdash;</div>
                </div>
              ))}
            </div>
          </section>
          <Panel title="Status" note="Not calculated">
            <EmptyState title="No validated aircraft data" hint="Figures appear only for aircraft profiles that carry validated performance data. Nothing is estimated." />
          </Panel>
        </div>
      </div>
      <PreviewNote />
    </div>
  );
}

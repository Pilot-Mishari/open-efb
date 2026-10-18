import { EmptyState, Panel, PreviewNote } from "../components/Panel";

const ACTIONS = ["Boarding", "Deboarding", "Catering", "Refuelling", "Pushback", "Jetway", "Stairs", "Reposition aircraft"];

export function GroundPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-instrument text-4xl font-semibold">Ground services</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 grid grid-cols-3 gap-3">
          {ACTIONS.map((a) => (
            <button key={a} disabled className="flex min-h-32 flex-col items-start justify-between rounded-2xl border border-dashed border-line p-4 text-left text-muted disabled:cursor-not-allowed">
              <span className="font-instrument text-2xl font-semibold text-text/70">{a}</span>
              <span className="text-sm">Unavailable</span>
            </button>
          ))}
        </div>
        <div className="space-y-4">
          <Panel title="GSX Pro" note="Not connected">
            <EmptyState title="No ground service link" hint="Service buttons turn on when the GSX adapter is connected and reports what the airport supports." />
          </Panel>
        </div>
      </div>
      <PreviewNote />
    </div>
  );
}

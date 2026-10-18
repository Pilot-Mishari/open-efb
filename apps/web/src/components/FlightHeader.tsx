import { Icon } from "../lib/icons";

const Stat = ({ label }: { label: string }) => (
  <div className="text-right">
    <dt className="text-sm text-muted">{label}</dt>
    <dd className="num text-2xl font-medium text-muted" aria-label="not available">&mdash;</dd>
  </div>
);

/** Persistent flight strip. Shows an honest empty state until a flight plan is loaded. */
export function FlightHeader() {
  return (
    <header className="flex items-center gap-8 border-b border-line bg-panel px-8 py-3">
      <div className="min-w-48">
        <div className="font-instrument text-2xl font-semibold">No flight loaded</div>
        <div className="text-sm text-muted">Flight plan import arrives in a later milestone</div>
      </div>
      <div className="flex flex-1 items-center gap-3 text-muted" aria-label="Route not set">
        <span className="num text-3xl">&mdash;&mdash;&mdash;&mdash;</span>
        <span className="h-px flex-1 border-t-2 border-dashed border-line" />
        <Icon name="cabin" className="h-6 w-6 rotate-90 text-teal" />
        <span className="h-px flex-1 border-t-2 border-dashed border-line" />
        <span className="num text-3xl">&mdash;&mdash;&mdash;&mdash;</span>
      </div>
      <dl className="flex gap-8">
        <Stat label="Departs" />
        <Stat label="Arrives" />
        <Stat label="Distance left" />
      </dl>
    </header>
  );
}

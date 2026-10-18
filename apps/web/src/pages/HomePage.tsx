import { Link } from "react-router-dom";
import { Icon } from "../lib/icons";
import { MODULES, type ModuleDef } from "../lib/modules";

function Tile({ m, className = "" }: { m: ModuleDef; className?: string }) {
  return (
    <Link to={m.path} className={`group flex flex-col justify-between rounded-xl border border-line bg-panel p-5 hover:bg-panel-hi ${className}`}>
      <Icon name={m.icon} className="h-8 w-8 text-teal" />
      <div className="mt-6">
        <div className="font-instrument text-2xl font-semibold">{m.name}</div>
        <div className="mt-0.5 text-muted">{m.blurb}</div>
        <div className="mt-3 text-sm text-muted">Layout preview, not built yet</div>
      </div>
    </Link>
  );
}

export function HomePage() {
  const by = (id: string) => MODULES.find((m) => m.id === id)!;
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-4 gap-4">
      <Link to="/cabin" className="relative col-span-2 row-span-2 flex min-h-72 flex-col justify-between overflow-hidden rounded-2xl bg-teal p-7 text-on-teal">
        <svg viewBox="0 0 400 300" className="pointer-events-none absolute -right-8 -top-4 h-72 w-96 opacity-25" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="260" cy="150" r="60" /><circle cx="260" cy="150" r="110" /><circle cx="260" cy="150" r="160" />
          <path d="M40 240 C 140 120, 240 190, 380 40" strokeDasharray="6 8" />
        </svg>
        <Icon name="cabin" className="relative h-10 w-10" />
        <div className="relative">
          <div className="font-instrument text-5xl font-semibold leading-none">CabinView</div>
          <p className="mt-3 max-w-xs text-lg">The passenger-style inflight display. Needs live flight data, so it arrives with the simulator link.</p>
        </div>
      </Link>
      <Tile m={by("briefing")} className="col-span-2" />
      <Tile m={by("ground")} />
      <Tile m={by("performance")} />
      <div className="col-span-4 grid grid-cols-5 gap-4">
        {MODULES.filter((m) => !["briefing", "ground", "performance"].includes(m.id)).map((m) => (
          <Link key={m.id} to={m.path} className="rounded-xl border border-line px-5 py-4 hover:bg-panel">
            <Icon name={m.icon} className="h-7 w-7 text-teal" />
            <div className="mt-3 font-instrument text-xl font-semibold">{m.name}</div>
            <div className="text-sm text-muted">{m.blurb}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

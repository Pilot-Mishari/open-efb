import { Link } from "react-router-dom";
import { SeatBadge } from "../components/SeatBadge";
import { CABIN_FEATURES, cabinFeaturePath } from "../lib/cabin-features";
import { Icon } from "../lib/icons";

export function CabinHomePage() {
  return (
    <div className="relative flex h-full flex-col overflow-y-auto p-8">
      <SeatBadge />
      <header className="pr-40">
        <h1 className="font-instrument text-4xl font-semibold">CabinView</h1>
        <p className="mt-1 text-lg text-muted">What would you like to do?</p>
      </header>
      <nav aria-label="CabinView features" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CABIN_FEATURES.map((f) => (
          <Link key={f.id} to={cabinFeaturePath(f.id)}
            className="flex items-center gap-4 rounded-2xl border border-line bg-panel p-6 hover:bg-panel-hi">
            <Icon name={f.icon} className="h-10 w-10 shrink-0 text-teal" />
            <span className="min-w-0">
              <span className="block font-instrument text-2xl font-semibold">{f.name}</span>
              <span className="block text-base text-muted">{f.blurb}</span>
            </span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex gap-3 pt-8">
        <Link to="/cabin" className="rounded-lg border border-line px-5 py-3 text-lg hover:bg-panel">Back to welcome</Link>
        <Link to="/" className="rounded-lg border border-line px-5 py-3 text-lg hover:bg-panel">Exit to EFB</Link>
      </div>
    </div>
  );
}
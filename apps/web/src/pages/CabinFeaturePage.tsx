import { Link } from "react-router-dom";
import { SeatBadge } from "../components/SeatBadge";
import { Icon } from "../lib/icons";
import type { CabinFeature } from "../lib/cabin-features";

/** Stand-in screen for a CabinView feature that is not built yet. */
export function CabinFeaturePage({ feature }: { feature: CabinFeature }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-4 overflow-y-auto p-8 text-center">
      <SeatBadge />
      <Icon name={feature.icon} className="h-12 w-12 text-teal" />
      <h1 className="font-instrument text-5xl font-semibold">{feature.name}</h1>
      <p className="max-w-md text-lg text-muted">{feature.blurb} This feature is coming soon.</p>
      <Link to="/cabin/home" className="mt-4 rounded-lg bg-teal px-6 py-3 text-lg font-medium text-on-teal hover:bg-teal-deep">Back to CabinView home</Link>
    </div>
  );
}
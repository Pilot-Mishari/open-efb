import { Link } from "react-router-dom";
import { SeatBadge } from "../components/SeatBadge";

export function CabinHomePage() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <SeatBadge />
      <h1 className="font-instrument text-4xl font-semibold">CabinView home</h1>
      <p className="max-w-md text-lg text-muted">The inflight home screen is not built yet.</p>
      <div className="mt-4 flex gap-3">
        <Link to="/cabin" className="rounded-lg border border-line px-5 py-3 text-lg hover:bg-panel">Back to welcome</Link>
        <Link to="/" className="rounded-lg bg-teal px-5 py-3 text-lg font-medium text-on-teal">Exit to EFB</Link>
      </div>
    </div>
  );
}
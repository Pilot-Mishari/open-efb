import { getSessionSeat } from "../lib/cabin";

export function SeatBadge() {
  const seat = getSessionSeat();
  return (
    <div className="absolute right-8 top-8 rounded-xl border border-line bg-panel/60 px-5 py-3 text-right backdrop-blur" aria-label={`Seat ${seat}`}>
      <div className="text-xs font-medium uppercase tracking-[0.25em] text-muted">Seat</div>
      <div className="num text-3xl font-semibold leading-none tracking-wide">{seat}</div>
    </div>
  );
}
import { Link } from "react-router-dom";

// Placeholder route. The real CabinView is built in milestone M4.
export function CabinPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-instrument text-4xl font-semibold">CabinView</h1>
      <p className="max-w-md text-lg text-muted">The inflight display is not built yet. It needs live flight data first.</p>
      <Link to="/" className="rounded-lg bg-teal px-5 py-3 text-lg font-medium text-on-teal">Back to home</Link>
    </div>
  );
}

import { Outlet } from "react-router-dom";
import { FlightWidget } from "../components/FlightWidget";

/** Wraps every CabinView screen after the welcome page so the flight widget stays put while the content changes. */
export function CabinLayout() {
  return (
    <div className="relative h-full overflow-hidden">
      <div className="h-full min-h-0 min-w-0"><Outlet /></div>
      <FlightWidget />
    </div>
  );
}
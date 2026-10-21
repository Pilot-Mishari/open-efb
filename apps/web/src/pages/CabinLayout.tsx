import { Outlet } from "react-router-dom";
import { FlightWidget } from "../components/FlightWidget";

/** Wraps every CabinView screen after the welcome page so the flight widget stays put while the content changes. */
export function CabinLayout() {
  return (
    <div className="flex h-full flex-col md:flex-row">
      <div className="min-h-0 min-w-0 flex-1"><Outlet /></div>
      <FlightWidget />
    </div>
  );
}
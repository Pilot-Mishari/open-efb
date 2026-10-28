import { Outlet } from "react-router-dom";
import { FlightWidget } from "../components/FlightWidget";
import { CabinRadioProvider } from "../lib/cabin-radio-context";

/**
 * Wraps every CabinView screen after the welcome page so the flight widget stays put while the
 * content changes. It also owns the automatic ATC listening, which must keep running while the ATC
 * screen and the embedded player are shown.
 */
export function CabinLayout() {
  return (
    <CabinRadioProvider>
      <div className="relative h-full overflow-hidden">
        <div className="h-full min-h-0 min-w-0"><Outlet /></div>
        <FlightWidget />
      </div>
    </CabinRadioProvider>
  );
}
import type { IconName } from "./icons";

export interface ModuleDef {
  id: string;
  path: string;
  name: string;
  blurb: string;
  icon: IconName;
  /** "live" screens work with real data today; "preview" screens only show the planned layout. */
  status: "live" | "preview";
  /** Left-hand section list shown inside the module, when it has one. */
  sections?: string[];
}

/** Every EFB module. "preview" modules are layout only until their milestone ships. */
export const MODULES: ModuleDef[] = [
  { id: "briefing", path: "/briefing", name: "Briefing", blurb: "Flight plan, route, fuel and OFP", icon: "briefing", status: "live",
    sections: ["Overview", "Departure", "Arrival", "Route", "Fuel and weight", "OFP"] },
  { id: "weather", path: "/weather", name: "Weather", blurb: "METAR, TAF and airport details", icon: "weather", status: "preview",
    sections: ["METAR", "TAF", "Airport"] },
  { id: "checklists", path: "/checklists", name: "Checklists", blurb: "Aircraft-specific, phase by phase", icon: "checklists", status: "preview" },
  { id: "charts", path: "/charts", name: "Charts", blurb: "Approach and airport charts", icon: "charts", status: "live" },
  { id: "ground", path: "/ground", name: "Ground services", blurb: "GSX Pro service status", icon: "ground", status: "live" },
  { id: "performance", path: "/performance", name: "Performance", blurb: "Takeoff and landing figures", icon: "performance", status: "preview" },
  { id: "network", path: "/network", name: "Network", blurb: "VATSIM controllers and frequencies", icon: "network", status: "live" },
  { id: "logbook", path: "/logbook", name: "Logbook", blurb: "Flights and landing rates", icon: "logbook", status: "preview" },
];
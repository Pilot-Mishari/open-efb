import type { IconName } from "./icons";

export interface ModuleDef {
  id: string;
  path: string;
  name: string;
  blurb: string;
  icon: IconName;
  /** Left-hand section list shown inside the module, when it has one. */
  sections?: string[];
}

/** Every EFB module. All are layout previews until their milestone ships. */
export const MODULES: ModuleDef[] = [
  { id: "briefing", path: "/briefing", name: "Briefing", blurb: "Flight plan, route, fuel and OFP", icon: "briefing",
    sections: ["Departure", "Arrival", "Weather", "NOTAMs", "Route map", "Fuel and weight", "OFP"] },
  { id: "weather", path: "/weather", name: "Weather", blurb: "METAR, TAF and airport details", icon: "weather",
    sections: ["METAR", "TAF", "Airport"] },
  { id: "checklists", path: "/checklists", name: "Checklists", blurb: "Aircraft-specific, phase by phase", icon: "checklists" },
  { id: "charts", path: "/charts", name: "Charts", blurb: "Approach and airport charts", icon: "charts" },
  { id: "ground", path: "/ground", name: "Ground services", blurb: "GSX Pro remote control", icon: "ground" },
  { id: "performance", path: "/performance", name: "Performance", blurb: "Takeoff and landing figures", icon: "performance" },
  { id: "network", path: "/network", name: "Network", blurb: "VATSIM controllers and frequencies", icon: "network",
    sections: ["Controllers", "ATIS"] },
  { id: "logbook", path: "/logbook", name: "Logbook", blurb: "Flights and landing rates", icon: "logbook" },
];

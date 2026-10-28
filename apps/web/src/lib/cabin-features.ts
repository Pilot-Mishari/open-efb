import type { IconName } from "./icons";

export interface CabinFeature {
  id: string;
  name: string;
  blurb: string;
  icon: IconName;
}

/**
 * CabinView feature cards. Each one routes to /cabin/<id>. Screens that are built are listed in
 * CABIN_CUSTOM in App.tsx; anything else falls back to the "coming soon" placeholder, so the two
 * lists must stay in step when a card is added or removed.
 */
export const CABIN_FEATURES: readonly CabinFeature[] = [
  { id: "map", name: "Flight Map", blurb: "Follow the flight on a live map.", icon: "charts" },
  { id: "flight-information", name: "Flight Information", blurb: "Route, times and flight progress.", icon: "briefing" },
  { id: "flight-board", name: "Airport Flight Board", blurb: "VATSIM departures and arrivals for both airports.", icon: "board" },
  { id: "atc", name: "ATC", blurb: "Listen in on air traffic control.", icon: "ground" },
  { id: "entertainment", name: "Entertainment", blurb: "Browse movies, shows and music.", icon: "logbook" },
];

export const cabinFeaturePath = (id: string): string => `/cabin/${id}`;
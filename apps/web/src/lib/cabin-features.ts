import type { IconName } from "./icons";

export interface CabinFeature {
  id: string;
  name: string;
  blurb: string;
  icon: IconName;
}

/**
 * CabinView feature cards. Each one routes to /cabin/<id>. Today every route shows a placeholder;
 * to build a feature later, add its page to CABIN_CUSTOM in App.tsx and leave this list alone.
 */
export const CABIN_FEATURES: readonly CabinFeature[] = [
  { id: "map", name: "Flight Map", blurb: "Follow the flight on a live map.", icon: "charts" },
  { id: "entertainment", name: "Entertainment", blurb: "Browse movies, shows and music.", icon: "logbook" },
  { id: "radio", name: "Radio", blurb: "Listen to live radio stations.", icon: "network" },
  { id: "atc", name: "ATC", blurb: "Listen in on air traffic control.", icon: "ground" },
  { id: "flight-information", name: "Flight Information", blurb: "Route, times and flight progress.", icon: "briefing" },
  { id: "about-flight", name: "About This Flight", blurb: "Aircraft and journey details.", icon: "cabin" },
];

export const cabinFeaturePath = (id: string): string => `/cabin/${id}`;
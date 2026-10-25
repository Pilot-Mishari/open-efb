export type IconName =
  | "home" | "briefing" | "weather" | "checklists" | "charts" | "ground"
  | "performance" | "network" | "logbook" | "settings" | "cabin";

// Simple original line icons on a 24x24 grid.
const PATHS: Record<IconName, string> = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  briefing: "M7 3h8l4 4v14H7z M15 3v4h4 M10 12h6 M10 16h6",
  weather: "M6 18a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.6-1.5A4.5 4.5 0 0 1 17 18z",
  checklists: "M9 6h11 M9 12h11 M9 18h11 M4 6l1.2 1.2L7 5 M4 12l1.2 1.2L7 11 M4 18l1.2 1.2L7 17",
  charts: "M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z M9 4v13 M15 7v13",
  ground: "M3 16V7h11v9 M14 10h4l3 3v3h-3 M7 16a2 2 0 1 0 .01 0 M17 16a2 2 0 1 0 .01 0",
  performance: "M4 17a8 8 0 1 1 16 0 M12 17l4-5",
  network: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18",
  logbook: "M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z M5 18a2 2 0 0 1 2-2h12",
  settings: "M4 7h10 M18 7h2 M4 17h2 M10 17h10 M16 5v4 M8 15v4",
  cabin: "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z",
};

export function Icon({ name, className = "h-6 w-6" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

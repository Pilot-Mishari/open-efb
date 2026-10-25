import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import { airportLocalTime, buildFlightMapData } from "../lib/flight-map";
import { utcTime } from "../lib/format";
import { usePlan } from "../lib/plan-context";
import { useSimState } from "../lib/sim-state";

const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY ?? "REPLACE_WITH_CARTO_API_KEY";
const TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors &copy; CARTO';

const withCartoKey = (url: string) => {
  if (!CARTO_API_KEY || CARTO_API_KEY === "REPLACE_WITH_CARTO_API_KEY") return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}key=${encodeURIComponent(CARTO_API_KEY)}`;
};

const MAP_THEMES = {
  dark: {
    name: "Dark",
    tileUrl: withCartoKey("https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"),
    panel: "bg-slate-950/80 border-slate-700/80 text-slate-100",
    label: "text-slate-300",
    button: "border-slate-600 bg-slate-900/80 text-slate-100 hover:bg-slate-800",
  },
  light: {
    name: "Light",
    tileUrl: withCartoKey("https://basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png"),
    panel: "bg-slate-950/75 border-slate-700/80 text-slate-100",
    label: "text-slate-300",
    button: "border-slate-600 bg-slate-900/80 text-slate-100 hover:bg-slate-800",
  },
} as const;

const airportIcon = (color: string) => L.divIcon({
  className: "leaflet-airport-marker",
  html: `<span class="airport-pin" style="background:${color};"></span>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const aircraftIcon = (heading: number | null) => L.divIcon({
  className: "leaflet-aircraft-marker",
  html: `<span class="aircraft-marker" style="transform: rotate(${(heading ?? 0).toFixed(0)}deg);"></span>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const formatHeading = (heading: number | null | undefined): string => {
  if (heading === null || heading === undefined || !Number.isFinite(heading)) return "—";
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round((((heading % 360) + 360) % 360) / 45) % directions.length;
  return `${Math.round(heading).toLocaleString("en-US")}° ${directions[index]}`;
};

function FitToView({ points, target, aircraftPosition }: { points: [number, number][]; target: "route" | "aircraft" | "free"; aircraftPosition: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (target === "free") return;

    const boundsPoints = target === "route" ? points : aircraftPosition ? [aircraftPosition] : points;
    if (boundsPoints.length === 0) return;

    if (boundsPoints.length === 1) {
      const singlePoint = boundsPoints[0];
      if (!singlePoint) return;
      map.setView(singlePoint, 6, { animate: true });
      return;
    }

    map.fitBounds(boundsPoints, { padding: [40, 40], maxZoom: 6 });
  }, [aircraftPosition, map, points, target]);

  return null;
}

function CabinMapPage() {
  const { plan } = usePlan();
  const sim = useSimState();
  const [mapError, setMapError] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [theme, setTheme] = useState<keyof typeof MAP_THEMES>("dark");
  const [centerMode, setCenterMode] = useState<"route" | "aircraft" | "free">("free");

  const mapData = useMemo(() => buildFlightMapData(plan, sim), [plan, sim]);

  const routePoints = useMemo<[number, number][]>(() => mapData.route.map((point) => [point.lat, point.lon]), [mapData.route]);
  const travelledPoints = useMemo<[number, number][]>(() => mapData.travelledRoute.map((point) => [point.lat, point.lon]), [mapData.travelledRoute]);
  const remainingPoints = useMemo<[number, number][]>(() => mapData.remainingRoute.map((point) => [point.lat, point.lon]), [mapData.remainingRoute]);
  const aircraftPosition = useMemo<[number, number] | null>(() => mapData.currentPoint ? [mapData.currentPoint.lat, mapData.currentPoint.lon] : null, [mapData.currentPoint]);

  const departure = plan?.origin ?? null;
  const destination = plan?.destination ?? null;
  const telemetry = sim.telemetry?.values ?? null;
  const currentHeading = telemetry?.headingTrueDeg ?? null;
  const currentAltitudeFt = telemetry?.altitudeFt ?? null;
  const currentGroundSpeedKt = telemetry?.groundSpeedKt ?? null;
  const progressPercent = Number.isFinite(mapData.progress) ? Math.round(mapData.progress) : 0;
  const etaUtc = plan?.times.estimatedIn ?? null;
  const elapsedMinutes = plan?.times.estimatedOut ? Math.max(0, (Date.now() - new Date(plan.times.estimatedOut).getTime()) / 60000) : null;
  const timeLeftMinutes = plan?.times.enrouteMinutes == null || elapsedMinutes === null ? null : Math.max(0, plan.times.enrouteMinutes - elapsedMinutes);

  const localOrigin = airportLocalTime(departure?.icao ?? null, new Date().toISOString());
  const localDestination = airportLocalTime(destination?.icao ?? null, new Date().toISOString());
  const localEtaDestination = airportLocalTime(destination?.icao ?? null, etaUtc);
  const details = [
    ["Origin local", localOrigin],
    ["Destination local", localDestination],
    ["ETA", utcTime(etaUtc)],
    ["Local ETA", localEtaDestination],
    ["Altitude", currentAltitudeFt === null || !Number.isFinite(currentAltitudeFt) ? "—" : `${Math.round(currentAltitudeFt).toLocaleString("en-US")} ft`],
    ["Heading", formatHeading(currentHeading)],
    ["Time left", timeLeftMinutes === null || !Number.isFinite(timeLeftMinutes) ? "—" : `${Math.round(timeLeftMinutes)} min`],
    ["Position", aircraftPosition ? `${aircraftPosition[0].toFixed(4)}°, ${aircraftPosition[1].toFixed(4)}°` : "—"],
  ];

  const themeConfig = MAP_THEMES[theme];

  if (!plan || routePoints.length < 2) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 rounded-3xl border border-line bg-panel/80 p-8 text-center">
        <div className="text-xs font-medium uppercase tracking-[0.25em] text-muted">Flight map</div>
        <h1 className="font-instrument text-4xl text-text">Map not available</h1>
        <p className="max-w-md text-base text-muted">
          Add a flight plan and wait for live telemetry to display the route, aircraft position, and progress.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl border border-line bg-panel/80">
      <div className={`absolute right-5 top-5 bottom-5 z-[500] flex w-[22rem] max-w-[calc(100%-2.5rem)] flex-col gap-2 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-sm ${themeConfig.panel}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/cabin/home" className="rounded-full border border-line bg-panel-hi px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted transition hover:text-text">Back</Link>
            <div>
              <div className="text-[9px] uppercase tracking-[0.28em] text-muted">Flight map</div>
              <div className="mt-0.5 font-instrument text-2xl text-text">{departure?.icao ?? "DEP"} → {destination?.icao ?? "ARR"}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} className={`rounded-full border px-2 py-1 text-[9px] font-medium uppercase tracking-[0.2em] ${themeConfig.button}`}>
              {themeConfig.name}
            </button>
            <button type="button" onClick={() => setShowDetails((value) => !value)} className={`grid h-8 w-8 place-items-center rounded-full border text-lg ${themeConfig.button}`} aria-label={showDetails ? "Collapse flight details" : "Expand flight details"}>
              {showDetails ? "−" : "+"}
            </button>
          </div>
        </div>

        <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-600/50 bg-slate-950/20 px-2 py-1.5">
          <span className="text-[9px] uppercase tracking-[0.2em] text-slate-400">Center</span>
          <div className="flex flex-wrap gap-1">
            {(["route", "aircraft", "free"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setCenterMode(mode)}
                className={`rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.15em] ${centerMode === mode ? "border-cyan-400 bg-cyan-500/15 text-cyan-200" : "border-slate-600 bg-slate-900/60 text-slate-300"}`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {showDetails && (
          <div className="mt-1 flex-1 space-y-2 overflow-y-auto border-t border-slate-600/60 pt-3 text-xs text-slate-200">
            {details.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-950/20 px-2 py-1.5">
                <span className="uppercase tracking-[0.18em] text-slate-400">{label}</span>
                <span className="font-medium text-white">{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {mapError && (
        <div className="absolute inset-x-4 bottom-4 z-[500] rounded-2xl border border-line bg-panel/90 px-3 py-2 text-sm text-muted shadow-lg backdrop-blur-sm">
          Map tiles failed to load. The route and telemetry are unavailable until the connection is restored.
        </div>
      )}

      <MapContainer center={[20, 0]} zoom={3} scrollWheelZoom className="h-full w-full" zoomControl>
        <FitToView points={routePoints} target={centerMode} aircraftPosition={aircraftPosition} />
        <TileLayer
          attribution={TILE_ATTRIBUTION}
          url={themeConfig.tileUrl}
          subdomains="abcd"
          maxZoom={19}
          eventHandlers={{
            tileerror: () => setMapError(true),
            load: () => setMapError(false),
          }}
        />

        <Polyline positions={routePoints} pathOptions={{ color: theme === "dark" ? "#5eead4" : "#0f766e", weight: 3, opacity: 0.9, dashArray: "10 8" }} />
        {travelledPoints.length > 1 && <Polyline positions={travelledPoints} pathOptions={{ color: "#22d3ee", weight: 5, opacity: 0.98 }} />}
        {remainingPoints.length > 1 && <Polyline positions={remainingPoints} pathOptions={{ color: theme === "dark" ? "#f1f5f9" : "#64748b", weight: 3, opacity: theme === "dark" ? 0.5 : 0.8 }} />}

        {departure && <Marker position={[departure.lat ?? 0, departure.lon ?? 0]} icon={airportIcon("#a7f3d0")} title="Departure" />}
        {destination && <Marker position={[destination.lat ?? 0, destination.lon ?? 0]} icon={airportIcon("#fbbf24")} title="Destination" />}
        {aircraftPosition && <Marker position={aircraftPosition} icon={aircraftIcon(currentHeading)} zIndexOffset={1000} title="Aircraft position" />}
      </MapContainer>

    </div>
  );
}

export default CabinMapPage;

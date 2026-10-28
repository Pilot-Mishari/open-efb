import type { FlightPlan, Telemetry } from "@open-efb/shared";
import type { SimState } from "./sim-state";

export interface MapPoint {
  lat: number;
  lon: number;
  label: string;
  kind: "origin" | "waypoint" | "destination" | "aircraft";
}

export interface FlightMapData {
  route: MapPoint[];
  travelledRoute: MapPoint[];
  remainingRoute: MapPoint[];
  currentPoint: MapPoint | null;
  totalDistanceNm: number;
  travelledNm: number;
  remainingNm: number;
  progress: number;
}

const AIRPORT_TIMEZONES: Record<string, string> = {
  KJFK: "America/New_York",
  KATL: "America/New_York",
  KDEN: "America/Denver",
  KSEA: "America/Los_Angeles",
  KSFO: "America/Los_Angeles",
  KPHX: "America/Phoenix",
  KCLT: "America/New_York",
  KMIA: "America/New_York",
  KLAX: "America/Los_Angeles",
  EGLL: "Europe/London",
  LFPG: "Europe/Paris",
  EDDF: "Europe/Berlin",
  EHAM: "Europe/Amsterdam",
  EDDM: "Europe/Berlin",
  KORD: "America/Chicago",
  CYVR: "America/Vancouver",
  CYYZ: "America/Toronto",
  OERK: "Asia/Riyadh",
  OEMA: "Asia/Riyadh",
  OEJN: "Asia/Riyadh",
  RJAA: "Asia/Tokyo",
  ZSPD: "Asia/Shanghai",
  BKK: "Asia/Bangkok",
  DXB: "Asia/Dubai",
  LHR: "Europe/London",
  MAD: "Europe/Madrid",
  CDG: "Europe/Paris",
  FRA: "Europe/Berlin",
  SIN: "Asia/Singapore",
};

/** "184° SW" for a heading, shared by every screen that shows one. */
export function formatHeading(heading: number | null | undefined): string {
  if (heading === null || heading === undefined || !Number.isFinite(heading)) return "—";
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round((((heading % 360) + 360) % 360) / 45) % directions.length;
  return `${Math.round(heading).toLocaleString("en-US")}° ${directions[index]}`;
}

const toRadians = (deg: number) => (deg * Math.PI) / 180;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function airportTimeZone(icao: string | null | undefined): string | null {
  const key = (icao ?? "").trim().toUpperCase();
  return key ? AIRPORT_TIMEZONES[key] ?? null : null;
}

export function airportLocalTime(icao: string | null | undefined, iso: string | null | undefined): string {
  const zone = airportTimeZone(icao);
  if (!zone || !iso) return "Not available";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Not available";
  const formatter = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: zone });
  return formatter.format(parsed);
}

function haversineNm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = 3440.065; // nautical miles Earth radius
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function toMapPoint(lat: number | null | undefined, lon: number | null | undefined, label: string, kind: MapPoint["kind"]): MapPoint | null {
  if (lat === null || lon === null || lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, label, kind };
}

function interpolate(a: MapPoint, b: MapPoint, t: number): MapPoint {
  const ratio = clamp(t, 0, 1);
  return {
    lat: a.lat + (b.lat - a.lat) * ratio,
    lon: a.lon + (b.lon - a.lon) * ratio,
    label: a.label,
    kind: "waypoint",
  };
}

function computeProgress(route: MapPoint[], currentPoint: MapPoint | null): { travelledRoute: MapPoint[]; remainingRoute: MapPoint[]; totalDistanceNm: number; travelledNm: number; remainingNm: number; progress: number } {
  if (route.length < 2) {
    return { travelledRoute: [], remainingRoute: [], totalDistanceNm: 0, travelledNm: 0, remainingNm: 0, progress: 0 };
  }

  const segmentLengths: number[] = new Array(route.length - 1).fill(0);
  let totalDistanceNm = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const previous = route[i];
    const point = route[i + 1];
    if (!previous || !point) continue;
    const value = haversineNm(previous, point);
    segmentLengths[i] = value;
    totalDistanceNm += value;
  }

  if (!currentPoint) {
    return { travelledRoute: [], remainingRoute: [...route], totalDistanceNm, travelledNm: 0, remainingNm: totalDistanceNm, progress: 0 };
  }

  const startRef = route[0];
  if (!startRef) {
    return { travelledRoute: [], remainingRoute: [...route], totalDistanceNm, travelledNm: 0, remainingNm: totalDistanceNm, progress: 0 };
  }

  const localRef = { lat: startRef.lat, lon: startRef.lon };
  const current = { lat: currentPoint.lat, lon: currentPoint.lon };
  let minDistance = Number.POSITIVE_INFINITY;
  let bestIndex = 0;
  let bestAlong = 0;
  let bestT = 0;

  let travelled = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const start = route[i];
    const end = route[i + 1];
    if (!start || !end) continue;
    const startProjected = { x: (start.lon - localRef.lon) * Math.cos(toRadians(localRef.lat)) * 60, y: (start.lat - localRef.lat) * 60 };
    const endProjected = { x: (end.lon - localRef.lon) * Math.cos(toRadians(localRef.lat)) * 60, y: (end.lat - localRef.lat) * 60 };
    const currentProjected = { x: (current.lon - localRef.lon) * Math.cos(toRadians(localRef.lat)) * 60, y: (current.lat - localRef.lat) * 60 };
    const dx = endProjected.x - startProjected.x;
    const dy = endProjected.y - startProjected.y;
    const numerator = (currentProjected.x - startProjected.x) * dx + (currentProjected.y - startProjected.y) * dy;
    const denominator = dx * dx + dy * dy;
    const t = denominator === 0 ? 0 : clamp(numerator / denominator, 0, 1);
    const projectionX = startProjected.x + dx * t;
    const projectionY = startProjected.y + dy * t;
    const segmentLength = segmentLengths[i] ?? 0;
    const distance = Math.hypot(currentProjected.x - projectionX, currentProjected.y - projectionY);
    if (distance < minDistance) {
      minDistance = distance;
      bestIndex = i;
      bestT = t;
      bestAlong = travelled + segmentLength * t;
    }
    travelled += segmentLength;
  }

  const travelledNm = clamp(bestAlong, 0, totalDistanceNm);
  const remainingNm = Math.max(0, totalDistanceNm - travelledNm);
  const progress = totalDistanceNm > 0 ? (travelledNm / totalDistanceNm) * 100 : 0;

  const currentStart = route[bestIndex];
  const currentEnd = route[bestIndex + 1];
  const travelledRoute: MapPoint[] = [...route.slice(0, bestIndex + 1)];
  if (bestIndex < route.length - 1 && currentStart && currentEnd) {
    travelledRoute.push(interpolate(currentStart, currentEnd, bestT));
  }

  const remainingRoute: MapPoint[] = [...route.slice(bestIndex + 1)];
  if (bestIndex < route.length - 1 && currentStart && currentEnd) {
    remainingRoute.unshift(interpolate(currentStart, currentEnd, bestT));
  }

  return { travelledRoute, remainingRoute, totalDistanceNm, travelledNm, remainingNm, progress };
}

export function buildFlightMapData(plan: FlightPlan | null, sim: SimState | Telemetry | { telemetry: Telemetry | null } | null): FlightMapData {
  if (!plan) {
    return { route: [], travelledRoute: [], remainingRoute: [], currentPoint: null, totalDistanceNm: 0, travelledNm: 0, remainingNm: 0, progress: 0 };
  }

  const route: MapPoint[] = [];
  const origin = toMapPoint(plan.origin?.lat ?? null, plan.origin?.lon ?? null, "Departure", "origin");
  const destination = toMapPoint(plan.destination?.lat ?? null, plan.destination?.lon ?? null, "Destination", "destination");
  if (origin) route.push(origin);
  for (const fix of plan.navlog ?? []) {
    const point = toMapPoint(fix?.lat ?? null, fix?.lon ?? null, fix?.ident ?? "Waypoint", "waypoint");
    if (point) route.push(point);
  }
  if (destination) route.push(destination);

  const currentTelemetry = sim && "values" in sim ? sim.values : sim && "telemetry" in sim ? sim.telemetry?.values ?? null : null;
  const currentPoint = currentTelemetry && currentTelemetry.latitudeDeg !== null && currentTelemetry.longitudeDeg !== null
    ? { lat: currentTelemetry.latitudeDeg, lon: currentTelemetry.longitudeDeg, label: "Aircraft", kind: "aircraft" as const }
    : null;

  const result = computeProgress(route, currentPoint);
  return {
    route,
    travelledRoute: result.travelledRoute,
    remainingRoute: result.remainingRoute,
    currentPoint,
    totalDistanceNm: result.totalDistanceNm,
    travelledNm: result.travelledNm,
    remainingNm: result.remainingNm,
    progress: result.progress,
  };
}

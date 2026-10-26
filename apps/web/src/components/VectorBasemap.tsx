    import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl(workerUrl);

export const OPENFREEMAP_STYLES = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/liberty",
} as const;

const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer noopener">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener">OpenStreetMap</a>';

interface Props {
  style: string;
  /** Called with false when the map reports a load error and true once it has loaded. */
  onStatus: (ok: boolean) => void;
  /** Called if the vector map cannot start at all (for example, no WebGL). */
  onUnavailable: () => void;
}

/** OpenFreeMap vector basemap drawn inside the existing Leaflet map. No API key is needed. */
export function VectorBasemap({ style, onStatus, onUnavailable }: Props) {
  const map = useMap();

  useEffect(() => {
    let layer: ReturnType<typeof maplibreGL> | null = null;
    try {
      layer = maplibreGL({ style, attribution: ATTRIBUTION });
      layer.addTo(map);
      const inner = layer.getMaplibreMap();
      inner.on("error", () => onStatus(false));
      inner.on("load", () => onStatus(true));
    } catch {
      onUnavailable();
    }
    return () => {
      if (layer) map.removeLayer(layer);
    };
  }, [map, style, onStatus, onUnavailable]);

  return null;
}
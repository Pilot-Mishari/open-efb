declare module "@maplibre/maplibre-gl-leaflet" {
  import type { Layer } from "leaflet";

  interface MaplibreMapLike {
    on(type: string, listener: (event: unknown) => void): unknown;
  }
  export interface MaplibreGlLayer extends Layer {
    getMaplibreMap(): MaplibreMapLike;
  }
  export function maplibreGL(options: { style: string; attribution?: string }): MaplibreGlLayer;
}
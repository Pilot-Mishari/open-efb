# Third-party software
Direct dependencies (see `pnpm-lock.yaml` for the full tree). Licenses should be re-verified before each release.

| Package | Use | License |
|---|---|---|
| electron, electron-builder | desktop shell and packaging | MIT |
| react, react-dom, react-router-dom | UI | MIT |
| vite, @vitejs/plugin-react, tailwindcss | build and styling | MIT |
| express, pino, zod | server, logging, validation | MIT |
| @fontsource/barlow, @fontsource/barlow-semi-condensed | self-hosted fonts | SIL OFL 1.1 (font files), MIT (package) |
| maplibre-gl, @maplibre/maplibre-gl-leaflet | draws the vector basemap inside Leaflet | BSD-3-Clause / ISC |
| vitest, @playwright/test, esbuild, tsx, typescript | tooling | MIT / Apache-2.0 |

Map data is fetched at run time and not bundled: vector tiles from [OpenFreeMap](https://openfreemap.org) (OpenMapTiles, data from OpenStreetMap contributors). If the vector map cannot start (for example, no WebGL), the map falls back to OpenStreetMap's standard tiles.

No third-party binaries, aircraft assets, charts or proprietary data are bundled. FSUIPC7 and the FSUIPC WebSocket Server are **not** bundled or redistributed; users install them from their authors.

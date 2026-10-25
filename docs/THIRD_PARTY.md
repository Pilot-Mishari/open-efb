# Third-party software
Direct dependencies (see `pnpm-lock.yaml` for the full tree). Licenses should be re-verified before each release.

| Package | Use | License |
|---|---|---|
| electron, electron-builder | desktop shell and packaging | MIT |
| react, react-dom, react-router-dom | UI | MIT |
| vite, @vitejs/plugin-react, tailwindcss | build and styling | MIT |
| express, pino, zod | server, logging, validation | MIT |
| @fontsource/barlow, @fontsource/barlow-semi-condensed | self-hosted fonts | SIL OFL 1.1 (font files), MIT (package) |
| vitest, @playwright/test, esbuild, tsx, typescript | tooling | MIT / Apache-2.0 |

No third-party binaries, aircraft assets, charts or proprietary data are bundled. FSUIPC7 and the FSUIPC WebSocket Server are **not** bundled or redistributed; users install them from their authors.

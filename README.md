# Open EFB

A free, open-source Electronic Flight Bag for flight simulators. A lightweight Windows companion runs a local web server; you use the EFB on a tablet, phone or second screen in a browser.

**Status: milestone M1 (foundation).** The app runs, serves the web UI, stores settings and logs. Tablet pairing (M2), live simulator telemetry (M3) and CabinView (M4) are not built yet. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Requirements
- Node.js 22.12 or newer (`.nvmrc` pins 22)
- pnpm 10 (`corepack enable` or `npm i -g pnpm@10`)
- Windows 10/11 to package the installer (development works on any OS)

## Develop
```bash
pnpm install
pnpm dev            # server on :4780 + web on http://localhost:5173 (hot reload)
pnpm dev:desktop    # build the web UI and open the Electron companion
pnpm test           # unit and integration tests
pnpm typecheck
```

## Build
```bash
pnpm build          # web, server, desktop bundles
pnpm package:win    # Windows NSIS installer in apps/desktop/release (run on Windows)
```

## Layout
| Path | Purpose |
|---|---|
| `apps/desktop` | Electron companion: window, tray, starts the server |
| `apps/server` | Express HTTP API, SQLite settings, logging, request guards |
| `apps/web` | React + Vite + Tailwind interface shared by Electron and browsers |
| `packages/shared` | Zod schemas and types used by server and web |
| `packages/simulator` | Simulator adapter interface and adapters (M3) |
| `packages/integrations` | SimBrief, weather, GSX, VATSIM (future) |
| `packages/profiles` | Aircraft profile schema and data (future) |
| `packages/ui` | Shared UI components (future) |

## Security model (current)
- The server binds to `127.0.0.1` only. LAN hosting is not available until M2 adds pairing and sessions.
- Requests with an unknown `Host` header are refused (DNS-rebinding defence); state-changing requests with a foreign `Origin` are refused.
- Settings can only be changed from the local machine.
- Electron: context isolation on, Node integration off, sandbox on, all permission requests denied, navigation limited to the local origin, minimal preload API.

## Known limitations
- Uses Node's built-in `node:sqlite`, which is still marked experimental (prints a warning). It avoids native-module builds; swap to `better-sqlite3` if it proves unstable.
- The Windows installer and tablet access have not been tested on real Windows hardware yet.
- Placeholder app icon (generated), to be replaced.

## License
MIT. Third-party notices: [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md).

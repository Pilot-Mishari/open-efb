# Contributing
1. `pnpm install`, then `pnpm test` and `pnpm typecheck` must pass.
2. Keep simulator-specific code inside `packages/simulator`; the UI only sees the normalized telemetry model.
3. Never present mock data as live data. Unavailable values are explicit, not invented.
4. Do not add third-party binaries or proprietary content without verified redistribution rights.
5. New dependencies are pinned to exact versions and listed in `docs/THIRD_PARTY.md`.

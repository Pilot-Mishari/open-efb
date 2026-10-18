import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEfbServer } from "./server";

// Headless entry point used for `pnpm dev` and server-only deployments.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const server = createEfbServer({
  dataDir: process.env.OPEN_EFB_DATA ?? path.join(root, "data"),
  webDir: path.join(root, "apps/web/dist"),
  version: process.env.npm_package_version ?? "0.1.0",
});
const info = await server.start();
console.log(`Open EFB server ready at ${info.url}`);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => void server.stop().then(() => process.exit(0)));

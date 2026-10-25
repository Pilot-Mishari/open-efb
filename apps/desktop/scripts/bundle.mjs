import { build } from "esbuild";
import { copyFileSync } from "node:fs";

const node = { bundle: true, platform: "node", target: "node22", format: "cjs", sourcemap: true, external: ["electron"] };
await build({ ...node, entryPoints: ["src/main.ts"], outfile: "dist/main.cjs" });
await build({ ...node, entryPoints: ["src/preload.ts"], outfile: "dist/preload.cjs" });
await build({ ...node, entryPoints: ["src/control/preload.ts"], outfile: "dist/control-preload.cjs" });
await build({ bundle: true, platform: "browser", target: "chrome120", format: "iife", sourcemap: true, entryPoints: ["src/control/control.ts"], outfile: "dist/control.js" });
copyFileSync("src/control/index.html", "dist/control.html");
console.log("desktop bundled");
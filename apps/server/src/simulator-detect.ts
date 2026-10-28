import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Detects installed copies of Microsoft Flight Simulator 2020 / 2024 on the machine running the
 * server (the simulator PC). Detection uses two verified signals only:
 *
 * - Steam: the per-app manifest files `steamapps\appmanifest_<id>.acf` across every Steam library
 *   folder. AppID 1250410 = MSFS 2020, 2537590 = MSFS 2024 (both published Steam store pages).
 * - Microsoft Store / Xbox app: the per-user package folders
 *   `%LOCALAPPDATA%\Packages\Microsoft.FlightSimulator_8wekyb3d8bbwe` (2020) and
 *   `Microsoft.Limitless_8wekyb3d8bbwe` (2024) — the exact names Microsoft documents for these
 *   packages.
 *
 * Only portable labels ever leave this module: no filesystem path or user name is included in
 * anything served to a client. Every filesystem/registry access is injectable for tests.
 */

export interface SimulatorInstall {
  /** Stable id, e.g. "msfs2024-steam". */
  id: string;
  /** Display name, e.g. "Microsoft Flight Simulator 2024 (Steam)". */
  label: string;
}

export interface DetectDeps {
  platform: NodeJS.Platform;
  /** The user's LOCALAPPDATA directory, or null when unknown. */
  localAppData: string | null;
  exists(p: string): boolean;
  read(p: string): string | null;
  /** Steam root directory reported by the registry, or null when Steam is not installed here. */
  steamRoot(): string | null;
}

/** Steam app ids, verified from the public store pages (store.steampowered.com/app/<id>/). */
const STEAM_MSFS_2020 = "1250410";
const STEAM_MSFS_2024 = "2537590";

/** Store package folder names under %LOCALAPPDATA%\Packages, verified from Microsoft support docs. */
const STORE_MSFS_2020 = "Microsoft.FlightSimulator_8wekyb3d8bbwe";
const STORE_MSFS_2024 = "Microsoft.Limitless_8wekyb3d8bbwe";

/** Reads the Steam root from HKCU (REG_SZ SteamPath). Windows only; returns null when absent. */
export function steamRootFromRegistry(run: (args: string[]) => string | null = defaultRegQuery): string | null {
  const out = run(["HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"]);
  if (!out) return null;
  const m = /SteamPath\s+REG_SZ\s+(.+)/i.exec(out);
  const p = m?.[1]?.trim();
  return p || null;
}

function defaultRegQuery(args: string[]): string | null {
  try {
    return execFileSync("reg", ["query", ...args], {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

/**
 * Every Steam library folder: the Steam root itself plus each `"path"` entry in
 * `steamapps\libraryfolders.vdf` (new `"path" "D:\games"` shape and the legacy `"1" "D:\games"`
 * shape). Backslashes are unescaped because KeyValues writes them doubled.
 */
export function steamLibraryFolders(steamRoot: string, read: (p: string) => string | null): string[] {
  const folders = new Set<string>([steamRoot]);
  const text = read(path.join(steamRoot, "steamapps", "libraryfolders.vdf"));
  if (text) {
    for (const m of text.matchAll(/"path"\s*"([^"]+)"/g)) folders.add(m[1]!.replace(/\\\\/g, "\\"));
    for (const m of text.matchAll(/"\d+"\s*"([A-Za-z]:\\[^"]+)"/g)) folders.add(m[1]!.replace(/\\\\/g, "\\"));
  }
  return [...folders];
}

/** Pure detection over injected primitives, so tests never touch a real machine. */
export function detectFrom(d: DetectDeps): SimulatorInstall[] {
  if (d.platform !== "win32") return [];
  const found = new Map<string, SimulatorInstall>();

  // Microsoft Store / Xbox app package folders.
  if (d.localAppData) {
    if (d.exists(path.join(d.localAppData, "Packages", STORE_MSFS_2020)))
      found.set("msfs2020-store", { id: "msfs2020-store", label: "Microsoft Flight Simulator 2020 (Microsoft Store)" });
    if (d.exists(path.join(d.localAppData, "Packages", STORE_MSFS_2024)))
      found.set("msfs2024-store", { id: "msfs2024-store", label: "Microsoft Flight Simulator 2024 (Microsoft Store)" });
  }

  // Steam: an appmanifest in any library folder means the sim is installed there.
  const root = d.steamRoot();
  if (root) {
    for (const lib of steamLibraryFolders(root, d.read)) {
      const manifest = (id: string) => path.join(lib, "steamapps", `appmanifest_${id}.acf`);
      if (!found.has("msfs2020-steam") && d.exists(manifest(STEAM_MSFS_2020)))
        found.set("msfs2020-steam", { id: "msfs2020-steam", label: "Microsoft Flight Simulator 2020 (Steam)" });
      if (!found.has("msfs2024-steam") && d.exists(manifest(STEAM_MSFS_2024)))
        found.set("msfs2024-steam", { id: "msfs2024-steam", label: "Microsoft Flight Simulator 2024 (Steam)" });
    }
  }
  return [...found.values()];
}

let cache: { at: number; value: SimulatorInstall[] } | null = null;

/**
 * Detection for the real machine. Windows only (both sims are Windows-only); the result is cached
 * for a minute so opening the setup wizard repeatedly does not re-query the registry and re-stat a
 * dozen folders.
 */
export function localSimulatorInstalls(now: () => number = Date.now): SimulatorInstall[] {
  if (process.platform !== "win32") return [];
  if (cache && now() - cache.at < 60_000) return cache.value;
  const value = detectFrom({
    platform: process.platform,
    localAppData: process.env.LOCALAPPDATA ?? null,
    exists: (p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    },
    read: (p) => {
      try {
        return fs.readFileSync(p, "utf8");
      } catch {
        return null;
      }
    },
    steamRoot: () => steamRootFromRegistry(),
  });
  cache = { at: now(), value };
  return value;
}

/** Test hook: forget the one-minute detection cache. */
export function resetSimulatorDetectCache(): void {
  cache = null;
}

/**
 * Whether FSUIPC7 sits in its documented default folder (`C:\FSUIPC7\FSUIPC7.exe`). A boolean only:
 * callers get a fact, never the path of the current user's install. FSUIPC installed somewhere else
 * simply reports false, so wording must stay "not detected", never "not installed".
 */
export function localFsuipcDetected(env: NodeJS.ProcessEnv = process.env): boolean {
  if (process.platform !== "win32") return false;
  const drive = env.SystemDrive ?? "C:";
  try {
    return fs.existsSync(path.join(`${drive}\\`, "FSUIPC7", "FSUIPC7.exe"));
  } catch {
    return false;
  }
}

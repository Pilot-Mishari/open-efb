import type { ListenDecision } from "@open-efb/shared";
import { buildEmbeddedBrowserUrl, buildVatsimListenUrl } from "./browser";

/**
 * Automatic ATC listening. The aircraft's tuned COM frequencies decide which station plays, so this
 * module is the whole decision layer: it never takes user input and never invents a station.
 * Kept free of React so it can be unit tested directly.
 */

/** The two CabinView screens this automation may move between. */
export const CABIN_ATC_PATH = "/cabin/atc";
export const CABIN_BROWSER_PATH = "/cabin/browser";
export const CABIN_WATCHED_PATHS: readonly string[] = [CABIN_ATC_PATH, CABIN_BROWSER_PATH];

/** How long a tuning must stay unchanged before it is matched: radios sweep through values while retuning. */
export const STABLE_MS = 2000;
/** How often the VATSIM lookup repeats while the ATC screen or the player is open. */
export const REFRESH_MS = 30_000;
/** How long the last known tuning is kept through missing telemetry, so a brief link drop does not reload the player. */
export const TELEMETRY_GRACE_MS = 10_000;

export interface RadioFreqs {
  com1: number | null;
  com2: number | null;
}

export const NO_FREQS: RadioFreqs = { com1: null, com2: null };

/** Identity of a tuning pair; a change of either radio is what triggers a new lookup. */
export const freqPairKey = (f: RadioFreqs): string => `${f.com1 ?? ""}|${f.com2 ?? ""}`;

/** 118.9 -> "118.900" (the form the VATSIM feed uses); null stays null. */
export const mhzKey = (mhz: number | null): string | null =>
  mhz === null ? null : (Math.round(mhz * 1000) / 1000).toFixed(3);

export interface CabinTarget {
  path: string;
  search: string;
}

/**
 * Where CabinView should be pointing for a decision.
 *
 * - "ok": the embedded browser at listen.vatsim.net/live/{CALLSIGN} (station comes from the feed,
 *   never from the user).
 * - any other *confirmed* state (nothing fits the tuned frequency): back to the ATC screen, so
 *   nothing keeps playing for a frequency the aircraft is no longer on.
 * - "unavailable" or no decision yet: null, because a failed lookup says nothing about what should
 *   be playing and must not tear down or open anything.
 */
export function desiredCabinRoute(decision: ListenDecision | null): CabinTarget | null {
  if (!decision || decision.status === "unavailable") return null;
  if (decision.status !== "ok" || !decision.station) return { path: CABIN_ATC_PATH, search: "" };

  const url = buildVatsimListenUrl(decision.station);
  if (!url) return { path: CABIN_ATC_PATH, search: "" };
  const target = buildEmbeddedBrowserUrl(url, { route: CABIN_BROWSER_PATH, returnTo: "/cabin/home" });
  if (!target) return { path: CABIN_ATC_PATH, search: "" };

  const q = target.indexOf("?");
  return q === -1 ? { path: target, search: "" } : { path: target.slice(0, q), search: target.slice(q) };
}

/** True while the ATC screen or the player is on screen and the automation may act. */
export const isWatchedPath = (pathname: string): boolean => CABIN_WATCHED_PATHS.includes(pathname);

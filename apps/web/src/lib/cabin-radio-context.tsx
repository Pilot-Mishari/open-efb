import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ListenDecision } from "@open-efb/shared";
import { api } from "./api";
import {
  NO_FREQS,
  REFRESH_MS,
  STABLE_MS,
  TELEMETRY_GRACE_MS,
  desiredCabinRoute,
  freqPairKey,
  isWatchedPath,
  mhzKey,
  type RadioFreqs,
} from "./cabin-radio";
import { useSimState } from "./sim-state";

export interface CabinRadioState {
  /** Tuned COM frequencies as MHz strings, or null when the simulator reports none. */
  com1: string | null;
  com2: string | null;
  /** Result of the last VATSIM lookup, or null before the first one. */
  decision: ListenDecision | null;
  /** True while a lookup is in flight. */
  busy: boolean;
  /** Simulator link headline for screens that need to explain a missing tuning. */
  simLabel: string;
  simDetail: string | null;
}

const Ctx = createContext<CabinRadioState | null>(null);

/** Read-only view of the automatic listening state; only CabinLayout provides it. */
export function useCabinRadio(): CabinRadioState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCabinRadio must be used inside CabinRadioProvider");
  return v;
}

const unavailable = (freq: RadioFreqs): ListenDecision => ({
  status: "unavailable",
  com1: mhzKey(freq.com1),
  com2: mhzKey(freq.com2),
  radio: null,
  frequency: null,
  station: null,
  position: null,
  controller: null,
  candidates: [],
  stale: true,
});

/**
 * Watches the aircraft's tuned frequencies, asks the server which VATSIM controller is online on
 * them, and moves CabinView between the ATC screen and the embedded player accordingly.
 *
 * Polling rules: one lookup when the tuning settles (or the screens are opened) plus one every
 * REFRESH_MS; the server caches the VATSIM feed for 30 s, so the upstream feed is hit at most that
 * often. The player only reloads when the station itself changes.
 */
export function CabinRadioProvider({ children }: { children: ReactNode }) {
  const sim = useSimState();
  const location = useLocation();
  const navigate = useNavigate();

  const [freq, setFreq] = useState<RadioFreqs>(NO_FREQS);
  const [decision, setDecision] = useState<ListenDecision | null>(null);
  const [busy, setBusy] = useState(false);

  const freqRef = useRef<RadioFreqs>(NO_FREQS);
  const settleTimer = useRef<number | undefined>(undefined);
  const lastLiveAt = useRef(0);

  const telemetry = sim.telemetry;
  const live = telemetry !== null;
  if (live) lastLiveAt.current = Date.now();
  // Missing telemetry: keep the last known tuning briefly (a link drop must not reload the player),
  // then treat it as "no frequency" so nothing keeps playing on a guess.
  const haveTelemetry = live || Date.now() - lastLiveAt.current < TELEMETRY_GRACE_MS;

  const raw: RadioFreqs = {
    com1: telemetry?.values.com1ActiveMhz ?? null,
    com2: telemetry?.values.com2ActiveMhz ?? null,
  };
  const rawKey = freqPairKey(raw);

  // Debounce the tuning: commit a new pair only after it has held still for STABLE_MS.
  useEffect(() => {
    window.clearTimeout(settleTimer.current);
    if (!live) {
      if (!haveTelemetry) {
        freqRef.current = NO_FREQS;
        setFreq(NO_FREQS);
      }
      return;
    }
    const first = freqRef.current.com1 === null && freqRef.current.com2 === null;
    const changed = freqPairKey(freqRef.current) !== rawKey;
    if (!changed) return;
    const commit = () => {
      freqRef.current = raw;
      setFreq(raw);
    };
    if (first) {
      commit(); // the first reading after a gap is used at once, so opening the ATC screen is not delayed
      return;
    }
    settleTimer.current = window.setTimeout(commit, STABLE_MS);
    return () => window.clearTimeout(settleTimer.current);
  }, [live, haveTelemetry, rawKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = freqPairKey(freq);
  const watched = isWatchedPath(location.pathname);

  const load = useCallback(async (cancelled: () => boolean) => {
    // Nothing tuned: that is knowable locally, so no lookup is made and nothing may open.
    if (freq.com1 === null && freq.com2 === null) {
      setDecision({
        status: "no_frequency",
        com1: null,
        com2: null,
        radio: null,
        frequency: null,
        station: null,
        position: null,
        controller: null,
        candidates: [],
        stale: false,
      });
      return;
    }
    setBusy(true);
    try {
      const d = await api.vatsimListen(freq.com1, freq.com2);
      if (!cancelled()) setDecision(d);
    } catch {
      // VATSIM or the server could not be reached: record that nothing can be decided right now.
      if (!cancelled()) setDecision(unavailable(freq));
    } finally {
      if (!cancelled()) setBusy(false);
    }
  }, [freq]);

  // One lookup when the screens open or the tuning changes, then one every REFRESH_MS.
  useEffect(() => {
    if (!watched) return;
    let done = false;
    const cancelled = () => done;
    void load(cancelled);
    const id = window.setInterval(() => void load(cancelled), REFRESH_MS);
    return () => {
      done = true;
      window.clearInterval(id);
    };
  }, [watched, key, load]);

  // Move CabinView to where the decision says it belongs, but only while one of the two ATC
  // screens is on screen, and only when that is actually a change (no pointless reloads).
  const target = desiredCabinRoute(decision);
  useEffect(() => {
    if (!target || !watched) return;
    if (location.pathname === target.path && location.search === target.search) return;
    navigate({ pathname: target.path, search: target.search }, { replace: true });
  }, [target, watched, location.pathname, location.search, navigate]);

  const value = useMemo<CabinRadioState>(
    () => ({
      com1: mhzKey(freq.com1),
      com2: mhzKey(freq.com2),
      decision,
      busy,
      simLabel: sim.label,
      simDetail: sim.detail,
    }),
    [freq, decision, busy, sim.label, sim.detail],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

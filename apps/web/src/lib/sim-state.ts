import { useEffect, useState } from "react";
import type { Telemetry } from "@open-efb/shared";
import { useLiveLink, useTelemetryFeed } from "./live-link";
import { useSettings } from "./settings-context";

export type SimKind = "no-link" | "waiting" | "disabled" | "connecting" | "disconnected" | "waiting-sim" | "stale" | "live" | "mock";

export interface SimState {
  kind: SimKind;
  /** Short headline, e.g. "Simulator connected". */
  label: string;
  /** Extra explanation from the server, when it has one. */
  detail: string | null;
  /** Null unless data is actually flowing, so callers cannot show numbers that are not real. */
  telemetry: Telemetry | null;
  sourceLabel: string;
  /** Age of the last sample in ms, or null if there has been none. */
  ageMs: number | null;
  /** True only for real simulator data that is fresh. */
  isLive: boolean;
}

function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

const SOURCE = { simconnect: "SimConnect (built into MSFS)", fsuipc: "FSUIPC7 WebSocket server", mock: "Mock (simulated)" } as const;

/** One place that decides what the simulator link currently means, so every screen says the same thing. */
export function useSimState(): SimState {
  const link = useLiveLink();
  const { message, receivedAt } = useTelemetryFeed();
  const { settings } = useSettings();
  const now = useNow(1000);

  const base = { detail: null, telemetry: null, sourceLabel: "None", ageMs: null, isLive: false };
  if (link !== "open") return { ...base, kind: "no-link", label: "Live link lost, reconnecting" };
  if (!message || receivedAt === null) return { ...base, kind: "waiting", label: "Waiting for the server" };

  const t = message.telemetry;
  const sourceLabel = t.source ? SOURCE[t.source] : "None";
  const common = { detail: t.detail, sourceLabel };
  const ageMs = t.updatedAt === null ? null : Math.max(0, message.serverTime - t.updatedAt + (now - receivedAt));

  switch (t.status) {
    case "disabled":
      return { ...base, ...common, kind: "disabled", label: "Simulator link is off", ageMs };
    case "connecting":
      return { ...base, ...common, kind: "connecting", label: "Connecting to the simulator", ageMs };
    case "disconnected":
      return { ...base, ...common, kind: "disconnected", label: "Simulator not connected", ageMs };
    case "connected": {
      if (t.updatedAt === null) return { ...base, ...common, kind: "waiting-sim", label: "Connected, waiting for the simulator", ageMs };
      const staleAfter = Math.max(5000, 4000 / settings.telemetryRateHz);
      if (ageMs !== null && ageMs > staleAfter) return { ...base, ...common, kind: "stale", label: "Data is stale", telemetry: t, ageMs };
      if (t.source === "mock") return { ...base, ...common, kind: "mock", label: "SIMULATED DATA, not live", telemetry: t, ageMs };
      return { ...base, ...common, kind: "live", label: "Simulator connected", telemetry: t, ageMs, isLive: true };
    }
  }
}
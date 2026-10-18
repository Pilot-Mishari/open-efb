import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { FlightPlan } from "@open-efb/shared";
import { api, describeError } from "./api";
import { useSettings } from "./settings-context";

export type PlanStatus = "unset" | "loading" | "ready" | "error";

interface Ctx {
  status: PlanStatus;
  plan: FlightPlan | null;
  /** True when SimBrief was unreachable and the last known plan is shown. */
  stale: boolean;
  error: string | null;
  reload: (force?: boolean) => Promise<void>;
}

const PlanCtx = createContext<Ctx | null>(null);

/** Holds the latest SimBrief plan so the header and every module share one copy. */
export function PlanProvider({ children }: { children: ReactNode }) {
  const { settings, server } = useSettings();
  const user = settings.simbriefUser;
  const [state, setState] = useState<Omit<Ctx, "reload">>({ status: "unset", plan: null, stale: false, error: null });

  const reload = useCallback(
    async (force = false) => {
      if (!user) return setState({ status: "unset", plan: null, stale: false, error: null });
      setState((s) => ({ ...s, status: "loading", error: null }));
      try {
        const r = await api.simbrief(force);
        setState({ status: "ready", plan: r.plan, stale: r.stale, error: null });
      } catch (e) {
        setState((s) => ({ status: "error", plan: s.plan, stale: false, error: describeError(e) }));
      }
    },
    [user],
  );

  // Load once the server is reachable, and again whenever the username changes.
  useEffect(() => {
    if (server === "online") void reload();
  }, [server, reload]);

  const value = useMemo(() => ({ ...state, reload }), [state, reload]);
  return <PlanCtx.Provider value={value}>{children}</PlanCtx.Provider>;
}

export function usePlan(): Ctx {
  const c = useContext(PlanCtx);
  if (!c) throw new Error("usePlan must be used inside PlanProvider");
  return c;
}
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { PairPage } from "../pages/PairPage";
import { api } from "./api";

type Status = "loading" | "authed" | "unpaired" | "offline";
type Role = "local" | "client" | null;

interface Ctx {
  status: Status;
  role: Role;
  label: string | null;
  refresh: () => Promise<void>;
  pair: (code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: Status; role: Role; label: string | null }>({ status: "loading", role: null, label: null });

  const refresh = useCallback(async () => {
    try {
      const s = await api.session();
      setState(s.authenticated ? { status: "authed", role: s.role, label: s.label } : { status: "unpaired", role: null, label: null });
    } catch {
      setState((p) => (p.status === "authed" ? p : { status: "offline", role: null, label: null }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onUnauthorized = () => void refresh();
    window.addEventListener("efb:unauthorized", onUnauthorized);
    return () => window.removeEventListener("efb:unauthorized", onUnauthorized);
  }, [refresh]);

  useEffect(() => {
    if (state.status !== "offline") return;
    const id = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(id);
  }, [state.status, refresh]);

  const pair = useCallback(async (code: string) => {
    await api.pair(code);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.logout();
    await refresh();
  }, [refresh]);

  const value = useMemo(() => ({ ...state, refresh, pair, logout }), [state, refresh, pair, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): Ctx {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "authed") return <>{children}</>;
  if (status === "unpaired") return <PairPage />;
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div>
        <div className="font-instrument text-3xl font-semibold">{status === "loading" ? "Connecting to Open EFB" : "Cannot reach Open EFB"}</div>
        {status === "offline" && <p className="mt-2 max-w-sm text-lg text-muted">Check that Open EFB is running on the PC and that this device is on the same Wi-Fi. Trying again automatically.</p>}
      </div>
    </div>
  );
}
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultSettings, type Settings, type SettingsPatch } from "@open-efb/shared";
import { api } from "./api";

type ServerState = "connecting" | "online" | "offline";

interface Ctx {
  settings: Settings;
  server: ServerState;
  version: string | null;
  update: (patch: SettingsPatch) => Promise<void>;
}

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [server, setServer] = useState<ServerState>("connecting");
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const [h, s] = await Promise.all([api.health(), api.settings()]);
        if (!alive) return;
        setVersion(h.version);
        setSettings(s);
        setServer("online");
      } catch {
        if (alive) setServer("offline");
      }
    };
    void poll();
    const id = window.setInterval(poll, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const update = useCallback(async (patch: SettingsPatch) => {
    const next = await api.patchSettings(patch);
    setSettings(next);
  }, []);

  const value = useMemo(() => ({ settings, server, version, update }), [settings, server, version, update]);
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): Ctx {
  const c = useContext(SettingsCtx);
  if (!c) throw new Error("useSettings must be used inside SettingsProvider");
  return c;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SetupWizard } from "../components/SetupWizard";
import { useAuth } from "./auth-context";
import { useSettings } from "./settings-context";

/**
 * Owns whether the first-launch setup wizard is open. It auto-opens exactly once per app run, and
 * only on the PC itself, only after the server answered with real settings, and only while setup
 * is not completed — so a finished (or skipped-for-good) setup never pops up again. Settings can
 * reopen it at any time through `open()`.
 */

interface Ctx {
  open: () => void;
  close: () => void;
}

const SetupWizardCtx = createContext<Ctx | null>(null);

export function SetupWizardProvider({ children }: { children: ReactNode }) {
  const { settings, server } = useSettings();
  const { role } = useAuth();
  const [isOpen, setOpen] = useState(false);
  const autoTried = useRef(false);

  useEffect(() => {
    if (autoTried.current || server !== "online") return;
    autoTried.current = true;
    if (role === "local" && !settings.setupCompleted) setOpen(true);
  }, [server, role, settings.setupCompleted]);

  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <SetupWizardCtx.Provider value={value}>
      {children}
      <SetupWizard open={isOpen} onClose={close} />
    </SetupWizardCtx.Provider>
  );
}

export function useSetupWizard(): Ctx {
  const c = useContext(SetupWizardCtx);
  if (!c) throw new Error("useSetupWizard must be used inside SetupWizardProvider");
  return c;
}

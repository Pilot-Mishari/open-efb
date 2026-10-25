import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { LockScreen, setJustPaired, wasJustPaired } from "../components/LockScreen";
import { usePlan } from "../lib/plan-context";
import { useSettings } from "../lib/settings-context";

const SERVER_PILL = {
  connecting: ["Reaching server", "bg-amber"],
  online: ["Server online", "bg-teal"],
  offline: ["Server unreachable", "bg-alert"],
} as const;

export function LaunchPage() {
  const navigate = useNavigate();
  const { plan, status, stale } = usePlan();
  const { server } = useSettings();
  const [skip] = useState(wasJustPaired);

  useEffect(() => setJustPaired(false), []);

  const alert = !plan
    ? status === "unset" ? ["No flight loaded", "Set your SimBrief username in Settings."] as const
      : status === "error" ? ["Flight plan", "Could not load the SimBrief plan."] as const
      : ["Flight plan", "Contacting SimBrief."] as const
    : stale ? ["Flight plan", "SimBrief unreachable, showing the last plan."] as const
    : null;

  if (skip) return <Navigate to="/home" replace />;
  return <LockScreen plan={plan} pill={SERVER_PILL[server]} alert={alert} onUnlock={() => navigate("/home")} />;
}
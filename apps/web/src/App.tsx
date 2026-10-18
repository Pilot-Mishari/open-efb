import type { ReactElement } from "react";
import { Route, Routes } from "react-router-dom";
import { Shell } from "./Shell";
import { CabinPage } from "./pages/CabinPage";
import { GroundPage } from "./pages/GroundPage";
import { HomePage } from "./pages/HomePage";
import { ModulePage } from "./pages/ModulePage";
import { PerformancePage } from "./pages/PerformancePage";
import { SettingsPage } from "./pages/SettingsPage";
import { MODULES } from "./lib/modules";

const CUSTOM: Record<string, ReactElement> = { ground: <GroundPage />, performance: <PerformancePage /> };

export function App() {
  return (
    <Routes>
      {/* CabinView is a full-screen passenger display and sits outside the EFB shell. */}
      <Route path="/cabin" element={<CabinPage />} />
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        {MODULES.map((m) => <Route key={m.id} path={m.path.slice(1)} element={CUSTOM[m.id] ?? <ModulePage />} />)}
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  );
}

import type { ReactElement } from "react";
import { Route, Routes } from "react-router-dom";
import { Shell } from "./Shell";
import { MODULES } from "./lib/modules";
import { BriefingPage } from "./pages/BriefingPage";
import { BrowserPage } from "./pages/BrowserPage";
import { CabinPage } from "./pages/CabinPage";
import { ChartsPage } from "./pages/ChartsPage";
import { GroundPage } from "./pages/GroundPage";
import { HomePage } from "./pages/HomePage";
import { ModulePage } from "./pages/ModulePage";
import { NetworkPage } from "./pages/NetworkPage";
import { PerformancePage } from "./pages/PerformancePage";
import { SettingsPage } from "./pages/SettingsPage";
import { CabinHomePage } from "./pages/CabinHomePage";
import { CabinLayout } from "./pages/CabinLayout";
import { CabinFeaturePage } from "./pages/CabinFeaturePage";
import { CabinATCPage } from "./pages/CabinATCPage";
import { CabinFlightInformationPage } from "./pages/CabinFlightInformationPage";
import { CabinFlightBoardPage } from "./pages/CabinFlightBoardPage";
import CabinMapPage from "./pages/CabinMapPage";
import { CABIN_FEATURES, cabinFeaturePath } from "./lib/cabin-features";
import { LaunchPage } from "./pages/LaunchPage";

// Real CabinView feature screens go here, keyed by feature id. Anything missing falls back to the placeholder.
const CABIN_CUSTOM: Record<string, ReactElement> = {
  map: <CabinMapPage />,
  atc: <CabinATCPage />,
  "flight-information": <CabinFlightInformationPage />,
  "flight-board": <CabinFlightBoardPage />,
};

const CUSTOM: Record<string, ReactElement> = {
  briefing: <BriefingPage />,
  network: <NetworkPage />,
  charts: <ChartsPage />,
  ground: <GroundPage />,
  performance: <PerformancePage />,
};

export function App() {
  return (
    <Routes>
      {/* CabinView is a full-screen passenger display and sits outside the EFB shell. */}
      <Route path="/cabin" element={<CabinPage />} />
      {/* Everything after the welcome screen shares one layout so the flight widget persists. */}
      <Route element={<CabinLayout />}>
        <Route path="/cabin/home" element={<CabinHomePage />} />
        <Route path="/cabin/browser" element={<BrowserPage />} />
        {CABIN_FEATURES.map((f) => <Route key={f.id} path={cabinFeaturePath(f.id)} element={CABIN_CUSTOM[f.id] ?? <CabinFeaturePage feature={f} />} />)}
      </Route>
      <Route index element={<LaunchPage />} />
      <Route element={<Shell />}>
        <Route path="home" element={<HomePage />} />
        {MODULES.map((m) => <Route key={m.id} path={m.path.slice(1)} element={CUSTOM[m.id] ?? <ModulePage />} />)}
        <Route path="browser" element={<BrowserPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  );
}
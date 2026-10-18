import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { PlanProvider } from "./lib/plan-context";
import { SettingsProvider } from "./lib/settings-context";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <SettingsProvider>
        <PlanProvider>
          <App />
        </PlanProvider>
      </SettingsProvider>
    </BrowserRouter>
  </StrictMode>,
);
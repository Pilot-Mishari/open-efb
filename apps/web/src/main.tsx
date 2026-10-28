import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthGate, AuthProvider } from "./lib/auth-context";
import { LiveLinkProvider } from "./lib/live-link";
import { PlanProvider } from "./lib/plan-context";
import { SettingsProvider } from "./lib/settings-context";
import { SetupWizardProvider } from "./lib/setup-wizard-context";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
      <AuthProvider>
        <AuthGate>
          <SettingsProvider>
            <SetupWizardProvider>
              <PlanProvider>
                <LiveLinkProvider>
                  <App />
                </LiveLinkProvider>
              </PlanProvider>
            </SetupWizardProvider>
          </SettingsProvider>
        </AuthGate>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
import net from "node:net";
import type { GsxStatus, SetupItem, SetupStatus, Settings, Telemetry } from "@open-efb/shared";
import type { SimulatorInstall } from "./simulator-detect";

/**
 * Turns observed facts about this computer into the rows of the first-launch setup wizard.
 *
 * Pure: no I/O here, so every status combination is unit-testable. The vocabulary is exactly the
 * four documented statuses — "connected" is only ever produced from real evidence (a live telemetry
 * stream, an answered port, a loaded SimBrief plan, an open GSX socket), never from a guess.
 */

/** Result of the live checks the route ran before calling `buildSetupStatus`. */
export interface SetupFacts {
  settings: Settings;
  gsx: GsxStatus;
  telemetry: Telemetry;
  /** Simulators found on this machine (labels only, no paths). */
  sims: SimulatorInstall[];
  /** Whether FSUIPC7 was detected in its default folder. */
  fsuipcInstalled: boolean;
  /** Whether the FSUIPC WebSocket port answered; null when not probed (simulator link off). */
  fsuipcPortOpen: boolean | null;
  /** Live SimBrief check: "unset" (no username), "ok", "unknown_user" or "unreachable". */
  simbrief: "unset" | "ok" | "unknown_user" | "unreachable";
  /** Route the plan takes when `simbrief` is "ok", e.g. "OMDB → LHR". */
  simbriefRoute: string | null;
  /** Live VATSIM feed check: null when it was not attempted. */
  vatsim: "ok" | "unreachable" | null;
}

const simbriefItem = (f: SetupFacts): SetupItem => {
  switch (f.simbrief) {
    case "unset":
      return {
        id: "simbrief",
        title: "SimBrief flight plan",
        status: "needs_setup",
        detail:
          "Enter your SimBrief username (or numeric Pilot ID) so the EFB can load your latest flight plan. A free SimBrief account is enough — no password is ever requested.",
        action: "save",
      };
    case "ok":
      return {
        id: "simbrief",
        title: "SimBrief flight plan",
        status: "connected",
        detail: `Your latest plan loaded${f.simbriefRoute ? `: ${f.simbriefRoute}` : ""}.`,
        action: "test",
      };
    case "unknown_user":
      return {
        id: "simbrief",
        title: "SimBrief flight plan",
        status: "needs_setup",
        detail: "SimBrief does not recognise that username or Pilot ID. Copy it exactly from your SimBrief profile and save again.",
        action: "save",
      };
    case "unreachable":
      return {
        id: "simbrief",
        title: "SimBrief flight plan",
        status: "optional",
        detail: "Your SimBrief username is saved, but SimBrief could not be reached just now. Press Test to try again.",
        action: "test",
      };
  }
};

const gsxItem = (f: SetupFacts): SetupItem => {
  switch (f.gsx.connection) {
    case "connected":
      return {
        id: "gsx",
        title: "GSX Pro ground services",
        status: "connected",
        detail: `GSX Pro is connected${f.gsx.sim ? ` (${f.gsx.sim})` : ""}. Ground services appear in the Ground module and CabinView boarding status.`,
        action: "test",
      };
    case "connecting":
      return {
        id: "gsx",
        title: "GSX Pro ground services",
        status: "optional",
        detail: "Waiting for GSX Pro's remote service to answer.",
        action: "test",
      };
    case "unreachable":
      return {
        id: "gsx",
        title: "GSX Pro ground services",
        status: "needs_setup",
        detail:
          "GSX Pro is installed but not answering. Start the simulator with GSX, and make sure the remote control server is enabled in GSX Settings. Press Test once it is running.",
        action: "test",
      };
    case "unavailable":
      return {
        id: "gsx",
        title: "GSX Pro ground services",
        status: "unavailable",
        detail: "GSX Pro was not detected on this computer. It is an optional add-on — every other part of the EFB works without it.",
        action: null,
      };
  }
};

const simulatorItem = (f: SetupFacts): SetupItem => {
  if (f.telemetry.status === "connected") {
    return {
      id: "simulator",
      title: "MSFS 2020 / 2024 simulator link",
      status: "connected",
      detail:
        f.telemetry.source === "mock"
          ? "Telemetry is flowing, but it is simulated test data — not a real flight simulator."
          : "Live flight data is flowing from the simulator.",
      action: "test",
    };
  }
  if (f.sims.length === 0) {
    return {
      id: "simulator",
      title: "MSFS 2020 / 2024 simulator link",
      status: "unavailable",
      detail:
        "No Microsoft Flight Simulator 2020 or 2024 installation was detected on this computer (Steam and Microsoft Store installs are both checked). The EFB still runs, but there is no live flight data.",
      action: "test",
    };
  }
  return {
    id: "simulator",
    title: "MSFS 2020 / 2024 simulator link",
    status: "optional",
    detail: `Detected: ${f.sims.map((s) => s.label).join(", ")}. Live data starts once the simulator is running and the bridge below is answering.`,
    action: "test",
  };
};

const fsuipcItem = (f: SetupFacts): SetupItem => {
  const title = "Live flight data";
  // SimConnect is the default link and ships with MSFS 2020/2024: when it is flowing, the row is
  // connected and says so, with no FSUIPC involved.
  if (f.telemetry.status === "connected" && f.telemetry.source === "simconnect") {
    return {
      id: "fsuipc",
      title,
      status: "connected",
      detail: "Live data is arriving over SimConnect, which is built into MSFS 2020 and 2024 — nothing else to install.",
      action: "test",
    };
  }
  if (f.telemetry.status === "connected" && f.telemetry.source === "fsuipc") {
    return {
      id: "fsuipc",
      title,
      status: "connected",
      detail: `Live data is arriving through the FSUIPC WebSocket server on port ${f.settings.fsuipcPort}.`,
      action: "test",
    };
  }
  if (!f.settings.simulatorEnabled) {
    return {
      id: "fsuipc",
      title,
      status: "needs_setup",
      detail: "Live flight data is switched off in Settings. Turn the simulator link on, then press Test.",
      action: "test",
    };
  }
  // The FSUIPC route is only chosen deliberately in Settings; it then has to be running.
  if (f.settings.simLink === "fsuipc") {
    if (f.fsuipcPortOpen) {
      return {
        id: "fsuipc",
        title,
        status: "connected",
        detail: `The FSUIPC WebSocket server is answering on port ${f.settings.fsuipcPort}.`,
        action: "test",
      };
    }
    return {
      id: "fsuipc",
      title,
      status: "needs_setup",
      detail: f.fsuipcInstalled
        ? `FSUIPC7 was detected, but its WebSocket server is not answering on port ${f.settings.fsuipcPort}. Start FSUIPC7 and the FSUIPC WebSocket Server (a separate free program by Paul Henty) with the simulator, then press Test.`
        : `Live flight data is set to the FSUIPC WebSocket Server, but neither FSUIPC7 nor its WebSocket Server was detected. Install both on the simulator PC and start them with MSFS, or switch the link back to SimConnect in Settings — SimConnect needs nothing installed.`,
      action: "test",
    };
  }
  return {
    id: "fsuipc",
    title,
    status: f.fsuipcPortOpen ? "connected" : "optional",
    detail: f.fsuipcPortOpen
      ? `The FSUIPC WebSocket server is answering on port ${f.settings.fsuipcPort}.`
      : "Live data arrives over SimConnect, which is built into MSFS 2020 and 2024 — nothing to install. It starts as soon as the simulator is running a flight; start MSFS, then press Test. (Settings can use the FSUIPC WebSocket Server instead if your setup already runs it.)",
    action: "test",
  };
};

const chartsItem = (f: SetupFacts): SetupItem => ({
  id: "charts",
  title: "Navigation charts",
  status: "optional",
  detail:
    f.settings.chartsProvider === "navigraph"
      ? "Charts open Navigraph's own website in a new browser tab under your Navigraph account (full coverage needs an Ultimate subscription). Navigraph licenses its Charts API only for EFBs inside the simulator's virtual cockpit, so this standalone EFB opens their site instead of embedding charts — no API key or approval is needed for that."
      : "Charts open ChartFox in a new browser tab. A free ChartFox account is enough; no key is stored by the EFB.",
  action: "open",
});

const vatsimItem = (f: SetupFacts): SetupItem =>
  f.vatsim === "ok"
    ? {
        id: "vatsim",
        title: "VATSIM radio and flight board",
        status: "connected",
        detail: "VATSIM data is reachable. ATC listening and the airport flight board use VATSIM's public feeds.",
        action: "test",
      }
    : {
        id: "vatsim",
        title: "VATSIM radio and flight board",
        status: "optional",
        detail:
          "ATC listening, the airport flight board and controller data use VATSIM's public feeds — no account, key or sign-up is needed. VATSIM could not be reached just now; press Test to try again.",
        action: "test",
      };

/** The wizard rows, in display order. Pure function of the observed facts. */
export function buildSetupStatus(f: SetupFacts): SetupStatus {
  return {
    completed: f.settings.setupCompleted,
    items: [simbriefItem(f), gsxItem(f), simulatorItem(f), fsuipcItem(f), chartsItem(f), vatsimItem(f)],
  };
}

/** Resolves true when the port accepts a connection within `timeoutMs`, false on refusal/timeout. */
export function probePort(port: number, timeoutMs = 800, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/** Bounds an upstream check so a hanging service can never stall the setup wizard. */
export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let id: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        id = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    clearTimeout(id);
  }
}

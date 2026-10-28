import { Router, type Response } from "express";
import { SimbriefError, boardForAirport, fetchLatestOfp, fetchVatsim, forAirport, matchListenStation, tuneKey, type LatestOfp, type VatsimSnapshot } from "@open-efb/integrations";
import type { GsxStatus, SetupStatus, TelemetryMessage } from "@open-efb/shared";
import type { Logger } from "pino";
import { TtlCache, type Cached } from "./cache";
import type { SettingsStore } from "./settings-store";
import { buildSetupStatus, probePort, withTimeout, type SetupFacts } from "./setup";
import { localFsuipcDetected, localSimulatorInstalls, type SimulatorInstall } from "./simulator-detect";

export interface IntegrationContext {
  settings: SettingsStore;
  logger: Logger;
  fetch?: typeof fetch | undefined;
  /** Live GSX Pro status, supplied by the server. */
  gsx?: (() => GsxStatus) | undefined;
  /** Live telemetry snapshot, supplied by the server. */
  telemetry?: (() => TelemetryMessage) | undefined;
  /** Machine detection, injected by tests; defaults to the real local probes. */
  detectSims?: (() => SimulatorInstall[]) | undefined;
  detectFsuipc?: (() => boolean) | undefined;
  probe?: ((port: number) => Promise<boolean>) | undefined;
}

const MINUTE = 60_000;

/** Telemetry with nothing connected — used only when the server supplied no snapshot at all. */
const NULL_VALUES = {
  latitudeDeg: null,
  longitudeDeg: null,
  altitudeFt: null,
  groundSpeedKt: null,
  indicatedAirspeedKt: null,
  headingTrueDeg: null,
  trackTrueDeg: null,
  verticalSpeedFpm: null,
  outsideAirTempC: null,
  onGround: null,
  com1ActiveMhz: null,
  com2ActiveMhz: null,
} as const;

export function integrationRoutes(ctx: IntegrationContext): Router {
  const router = Router();
  const vatsim = new TtlCache<VatsimSnapshot>(30_000, 5 * MINUTE);
  const simbrief = new TtlCache<LatestOfp>(MINUTE, 60 * MINUTE);
  const http = ctx.fetch ? { fetch: ctx.fetch } : {};
  const probe = ctx.probe ?? ((port: number) => probePort(port));

  // First-launch setup wizard: every status below is backed by a live check on this request — a
  // SimBrief fetch, a VATSIM fetch, a TCP probe of the FSUIPC port and the real telemetry/GSX
  // snapshots. Failures become honest statuses, never guesses, and every check is bounded so a
  // hanging upstream can not stall the wizard. Reads only; no setting is written here.
  router.get("/setup", async (req, res) => {
    const s = ctx.settings.get();
    // ?refresh=1 (the wizard's Test button) bypasses the shared caches, but never more often than
    // every 15 seconds, so hammering Test cannot hammer the upstream services either.
    const force = req.query.refresh === "1";
    const planRef: { current: Cached<LatestOfp> | null } = { current: null };
    const simbriefCheck = async (): Promise<SetupFacts["simbrief"]> => {
      const user = s.simbriefUser;
      if (!user) return "unset";
      try {
        planRef.current = await withTimeout(
          simbrief.get(user.toLowerCase(), () => fetchLatestOfp(user, http), { force, minRefreshMs: 15_000 }),
          8_000,
        );
        return "ok";
      } catch (err) {
        return err instanceof SimbriefError && err.code === "user_not_found" ? "unknown_user" : "unreachable";
      }
    };
    const vatsimCheck = async (): Promise<SetupFacts["vatsim"]> => {
      try {
        await withTimeout(vatsim.get("feed", () => fetchVatsim(http), { force, minRefreshMs: 5_000 }), 8_000);
        return "ok";
      } catch {
        return "unreachable";
      }
    };

    const [simbriefState, vatsimState, fsuipcPortOpen] = await Promise.all([
      simbriefCheck(),
      vatsimCheck(),
      s.simulatorEnabled ? probe(s.fsuipcPort).catch(() => false) : Promise.resolve(null),
    ]);

    let simbriefRoute: string | null = null;
    if (simbriefState === "ok" && planRef.current) {
      const from = planRef.current.data.plan.origin.icao;
      const to = planRef.current.data.plan.destination.icao;
      simbriefRoute = from && to ? `${from} \u2192 ${to}` : null;
    }

    const facts: SetupFacts = {
      settings: s,
      gsx: ctx.gsx?.() ?? { connection: "unavailable", detail: null, gsxRunning: null, protocol: null, engine: null, sim: null, capabilities: [], airport: null, gate: null, aircraft: null, services: [], pushback: null, updatedAt: null },
      telemetry: ctx.telemetry?.().telemetry ?? { source: null, status: "disconnected", detail: "No telemetry source.", updatedAt: null, values: NULL_VALUES },
      sims: ctx.detectSims ? ctx.detectSims() : localSimulatorInstalls(),
      fsuipcInstalled: ctx.detectFsuipc ? ctx.detectFsuipc() : localFsuipcDetected(),
      fsuipcPortOpen,
      simbrief: simbriefState,
      simbriefRoute,
      vatsim: vatsimState,
    };
    const body: SetupStatus = buildSetupStatus(facts);
    res.json(body);
  });

  /**
   * Records that the wizard was finished (or dismissed for good). Only an acknowledgement flag is
   * written, so any paired device may call it; every actual setting stays behind the local-only
   * PATCH /api/settings guard.
   */
  router.post("/setup/complete", (_req, res) => {
    ctx.settings.update({ setupCompleted: true });
    res.json({ ok: true });
  });

  // Airport flight board: both directions for one airport, read from the same VATSIM feed cache
  // the ATC listener uses — one keyless upstream download per 30 seconds at most, shared by every
  // open screen. 400 = malformed code, 502 = VATSIM could not be reached.
  router.get("/flightboard/:code", async (req, res) => {
    const code = String(req.params.code ?? "").toUpperCase();
    if (!/^[A-Z0-9]{3,4}$/.test(code)) {
      res.status(400).json({ error: "invalid_icao" });
      return;
    }
    try {
      const c = await vatsim.get("feed", () => fetchVatsim(http));
      res.json({
        source: "vatsim",
        code,
        fetchedAt: c.fetchedAt,
        stale: c.stale,
        departures: boardForAirport(c.data.flights, code, "departures"),
        arrivals: boardForAirport(c.data.flights, code, "arrivals"),
      });
    } catch (err) {
      ctx.logger.warn({ err, code }, "VATSIM flight board fetch failed");
      res.status(502).json({ error: "flightboard_unavailable" });
    }
  });

  router.get("/vatsim/airport/:icao", async (req, res) => {
    const icao = String(req.params.icao ?? "");
    if (!/^[A-Za-z0-9]{3,4}$/.test(icao)) {
      res.status(400).json({ error: "invalid_icao" });
      return;
    }
    try {
      const c = await vatsim.get("feed", () => fetchVatsim(http));
      res.json(forAirport(c.data, icao, { fetchedAt: c.fetchedAt, stale: c.stale }));
    } catch (err) {
      ctx.logger.warn({ err }, "VATSIM fetch failed");
      res.status(502).json({ error: "vatsim_unavailable" });
    }
  });

  /** A query frequency must be plain MHz ("118.900"), anything else is rejected as malformed input. */
  const queryFreq = (v: unknown): number | null => {
    if (v === undefined) return null;
    const s = Array.isArray(v) ? v[0] : v;
    if (typeof s !== "string" || !/^\d{1,3}(\.\d{1,3})?$/.test(s)) throw new Error("invalid_frequency");
    return Number(s);
  };

  // Automatic ATC listening: the cockpit tells us the tuned COM frequencies, VATSIM tells us who is
  // online, and this answers which single station (if any) may be opened. 400 means malformed input,
  // 502 means VATSIM could not be reached; neither may ever produce a station.
  router.get("/vatsim/listen", async (req, res) => {
    let com1: number | null;
    let com2: number | null;
    try {
      com1 = queryFreq(req.query.com1);
      com2 = queryFreq(req.query.com2);
    } catch {
      res.status(400).json({ error: "invalid_frequency" });
      return;
    }
    // Nothing tuned (or nothing in the airband): answer immediately without touching VATSIM.
    if (!tuneKey(com1) && !tuneKey(com2)) {
      res.json({ status: "no_frequency", com1: null, com2: null, radio: null, frequency: null, station: null, position: null, controller: null, candidates: [], stale: false });
      return;
    }
    try {
      const c = await vatsim.get("feed", () => fetchVatsim(http));
      res.json(matchListenStation(c.data, { com1, com2 }, { stale: c.stale }));
    } catch (err) {
      ctx.logger.warn({ err }, "VATSIM fetch failed");
      res.status(502).json({ error: "vatsim_unavailable" });
    }
  });

  const getPlan = (force: boolean) => {
    const user = ctx.settings.get().simbriefUser;
    if (!user) throw new SimbriefError("user_not_found", "simbrief_user_not_set");
    return simbrief.get(user.toLowerCase(), () => fetchLatestOfp(user, http), { force, minRefreshMs: 15_000 });
  };

  const fail = (res: Response, err: unknown) => {
    const e = err instanceof SimbriefError ? err : new SimbriefError("upstream", "SimBrief request failed");
    if (e.message === "simbrief_user_not_set") {
      res.status(400).json({ error: "simbrief_user_not_set" });
      return;
    }
    ctx.logger.warn({ code: e.code, message: e.message }, "SimBrief request failed");
    res.status(e.code === "user_not_found" ? 404 : 502).json({ error: `simbrief_${e.code}`, message: e.message });
  };

  router.get("/simbrief/latest", async (req, res) => {
    try {
      const c = await getPlan(req.query.refresh === "1");
      res.json({ plan: c.data.plan, stale: c.stale });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get("/simbrief/ofp", async (_req, res) => {
    try {
      const c = await getPlan(false);
      res.json({ text: c.data.text, generatedAt: c.data.plan.generatedAt, stale: c.stale });
    } catch (err) {
      fail(res, err);
    }
  });

  return router;
}
import { Router } from "express";
import { SimbriefError, fetchLatestOfp, fetchVatsim, forAirport, type VatsimSnapshot } from "@open-efb/integrations";
import type { FlightPlan } from "@open-efb/shared";
import type { Logger } from "pino";
import { TtlCache } from "./cache";
import type { SettingsStore } from "./settings-store";

export interface IntegrationContext {
  settings: SettingsStore;
  logger: Logger;
  /** Injectable for tests. Defaults to the global fetch. */
  fetch?: typeof fetch | undefined;
}

const MINUTE = 60_000;

export function integrationRoutes(ctx: IntegrationContext): Router {
  const router = Router();
  const vatsim = new TtlCache<VatsimSnapshot>(30_000, 5 * MINUTE);
  const simbrief = new TtlCache<FlightPlan>(MINUTE, 60 * MINUTE);
  const http = ctx.fetch ? { fetch: ctx.fetch } : {};

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

  router.get("/simbrief/latest", async (req, res) => {
    const user = ctx.settings.get().simbriefUser;
    if (!user) {
      res.status(400).json({ error: "simbrief_user_not_set" });
      return;
    }
    try {
      const c = await simbrief.get(user.toLowerCase(), () => fetchLatestOfp(user, http), { force: req.query.refresh === "1", minRefreshMs: 15_000 });
      res.json({ plan: c.data, stale: c.stale });
    } catch (err) {
      const e = err instanceof SimbriefError ? err : new SimbriefError("upstream", "SimBrief request failed");
      ctx.logger.warn({ code: e.code, message: e.message }, "SimBrief fetch failed");
      res.status(e.code === "user_not_found" ? 404 : 502).json({ error: `simbrief_${e.code}`, message: e.message });
    }
  });

  return router;
}
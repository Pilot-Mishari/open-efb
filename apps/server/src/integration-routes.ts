import { Router, type Response } from "express";
import { SimbriefError, fetchLatestOfp, fetchVatsim, forAirport, type LatestOfp, type VatsimSnapshot } from "@open-efb/integrations";
import type { Logger } from "pino";
import { TtlCache } from "./cache";
import type { SettingsStore } from "./settings-store";

export interface IntegrationContext {
  settings: SettingsStore;
  logger: Logger;
  fetch?: typeof fetch | undefined;
}

const MINUTE = 60_000;

export function integrationRoutes(ctx: IntegrationContext): Router {
  const router = Router();
  const vatsim = new TtlCache<VatsimSnapshot>(30_000, 5 * MINUTE);
  const simbrief = new TtlCache<LatestOfp>(MINUTE, 60 * MINUTE);
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
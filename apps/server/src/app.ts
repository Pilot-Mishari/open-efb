import fs from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import { SettingsPatchSchema, type Health, type TelemetryMessage } from "@open-efb/shared";
import type { Logger } from "pino";
import { authRoutes, requireAuth, requireLocal, type AuthDeps } from "./auth";
import { hostGuard, originGuard } from "./guard";
import { integrationRoutes } from "./integration-routes";
import type { SettingsStore } from "./settings-store";

export interface AppContext {
  version: string;
  startedAt: number;
  settings: SettingsStore;
  logger: Logger;
  webDir?: string | undefined;
  fetch?: typeof fetch | undefined;
  auth: AuthDeps;
  telemetry: () => TelemetryMessage;
}

export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable("x-powered-by");
  const lan = () => ctx.settings.get().lanAccessEnabled;

  app.use(hostGuard(lan));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });
  app.use(express.json({ limit: "100kb" }));
  app.use(originGuard(lan));

  app.get("/api/health", (_req, res) => {
    const body: Health = {
      app: "open-efb",
      version: ctx.version,
      uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
    };
    res.json(body);
  });

  app.get("/api/telemetry", (_req, res) => {
  res.json(ctx.telemetry());
  });
  app.use("/api", authRoutes(ctx.auth));
  app.use("/api", requireAuth(ctx.auth));

  app.get("/api/settings", (_req, res) => {
    res.json(ctx.settings.get());
  });

  app.patch("/api/settings", requireLocal(ctx.auth), (req, res) => {
    const parsed = SettingsPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_settings", issues: parsed.error.issues });
      return;
    }
    const before = ctx.settings.get();
    const next = ctx.settings.update(parsed.data);
    ctx.logger.info({ changed: Object.keys(parsed.data) }, "settings updated");
    res.json({ settings: next, restartRequired: next.port !== before.port });
  });

  app.use("/api", integrationRoutes({ settings: ctx.settings, logger: ctx.logger, fetch: ctx.fetch }));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  const webDir = ctx.webDir ? path.resolve(ctx.webDir) : undefined;
  if (webDir && fs.existsSync(path.join(webDir, "index.html"))) {
    app.use(express.static(webDir, { index: false, maxAge: "1h" }));
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      res.sendFile(path.join(webDir, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res.type("text/plain").send("Open EFB server is running. Web UI not built yet (run `pnpm build:web`).");
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const e = err as { type?: string; status?: number };
    if (e.type === "entity.parse.failed") {
      res.status(400).json({ error: "invalid_json" });
      return;
    }
    if (e.type === "entity.too.large") {
      res.status(413).json({ error: "payload_too_large" });
      return;
    }
    ctx.logger.error({ err }, "unhandled request error");
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
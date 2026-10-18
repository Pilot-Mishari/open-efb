import type { Server } from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import { createApp } from "./app";
import { openDatabase } from "./db";
import { createLogger, type LogBuffer } from "./logger";
import { SettingsStore } from "./settings-store";

export interface ServerOptions {
  dataDir: string;
  version?: string;
  webDir?: string;
  /** Overrides the saved port (0 = pick a free port; used by tests). */
  port?: number;
  logToStdout?: boolean;
  fetch?: typeof fetch;
}

export interface EfbServer {
  start(): Promise<{ host: string; port: number; url: string }>;
  stop(): Promise<void>;
  /** Stops the server and releases the database and log file. Call once on shutdown. */
  dispose(): Promise<void>;
  isRunning(): boolean;
  settings: SettingsStore;
  logger: Logger;
  logs: LogBuffer;
}

export function createEfbServer(opts: ServerOptions): EfbServer {
  const { logger, buffer, close: closeLogger } = createLogger({ dataDir: opts.dataDir, toStdout: opts.logToStdout ?? true });
  const db: DatabaseSync = openDatabase(path.resolve(opts.dataDir));
  const settings = new SettingsStore(db, logger);
  const app = createApp({
    version: opts.version ?? "0.0.0",
    startedAt: Date.now(),
    settings,
    logger,
    webDir: opts.webDir,
    fetch: opts.fetch,
  });
  let http: Server | null = null;

  const stop = async (): Promise<void> => {
    const srv = http;
    if (!srv) return;
    http = null;
    await new Promise<void>((resolve) => {
      srv.close(() => resolve());
      srv.closeAllConnections();
    });
    logger.info("server stopped");
  };

  return {
    stop,
    async dispose() {
      await stop();
      db.close();
      await closeLogger();
    },
    settings,
    logger,
    logs: buffer,
    isRunning: () => http !== null,
    start() {
      if (http) return Promise.reject(new Error("server already running"));
      // M1 binds to loopback only. LAN hosting is added in M2 together with
      // pairing and session authentication; until then it is never exposed.
      const host = "127.0.0.1";
      const port = opts.port ?? settings.get().port;
      if (settings.get().lanAccessEnabled) logger.warn("lanAccessEnabled is set but LAN hosting is not available yet; staying on loopback");
      return new Promise((resolve, reject) => {
        const srv = app.listen(port, host);
        srv.once("error", reject);
        srv.once("listening", () => {
          http = srv;
          const addr = srv.address() as AddressInfo;
          logger.info({ host, port: addr.port }, "server listening");
          resolve({ host, port: addr.port, url: `http://localhost:${addr.port}` });
        });
      });
    },
  };
}

import type { IncomingMessage, Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { Duplex } from "node:stream";
import type { AccessState } from "@open-efb/shared";
import type { Logger } from "pino";
import { createApp } from "./app";
import { identify, type AuthDeps } from "./auth";
import { openDatabase } from "./db";
import { hostAllowed, isLoopback, lanAddresses, originAllowed } from "./guard";
import { GsxManager, localGsxLocator, type GsxLocator } from "./gsx";
import { ClientHub } from "./hub";
import { createLogger, type LogBuffer } from "./logger";
import { Pairing, type PairingOptions } from "./pairing";
import { SessionStore } from "./sessions";
import { SettingsStore } from "./settings-store";
import { SimulatorManager } from "./simulator";
import type { SimulatorInstall } from "./simulator-detect";

export interface ServerOptions {
  dataDir: string;
  version?: string;
  webDir?: string;
  port?: number;
  logToStdout?: boolean;
  fetch?: typeof fetch;
  isLocal?: (req: IncomingMessage) => boolean;
  pairing?: PairingOptions;
  simulator?: "fsuipc" | "mock";
  /** How GSX Pro is located on this machine. Injected by tests; defaults to the local GSX config. */
  gsxLocator?: GsxLocator;
  /** Machine probes behind GET /api/setup. Injected by tests; default to the real local checks. */
  detectSims?: () => SimulatorInstall[];
  detectFsuipc?: () => boolean;
  probePort?: (port: number) => Promise<boolean>;
}

export interface AccessControl {
  state(): AccessState;
  setLan(enabled: boolean): Promise<void>;
  rotateCode(): void;
  revoke(id: string): void;
  revokeAll(): void;
  onChange(cb: () => void): () => void;
}

export interface EfbServer {
  start(): Promise<{ host: string; port: number; url: string }>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
  isRunning(): boolean;
  settings: SettingsStore;
  logger: Logger;
  logs: LogBuffer;
  access: AccessControl;
}

export function createEfbServer(opts: ServerOptions): EfbServer {
  const version = opts.version ?? "0.0.0";
  const { logger, buffer, close: closeLogger } = createLogger({ dataDir: opts.dataDir, toStdout: opts.logToStdout ?? true });
  const db = openDatabase(path.resolve(opts.dataDir));
  const settings = new SettingsStore(db, logger);
  const sessions = new SessionStore(db);
  const pairing = new Pairing(opts.pairing);
  const hub = new ClientHub(version);
  const isLocal = opts.isLocal ?? ((req: IncomingMessage) => isLoopback(req.socket.remoteAddress));
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  pairing.onChange(emit);
  hub.onChange(emit);

  const auth: AuthDeps = {
    sessions,
    pairing,
    isLocal,
    changed: emit,
    revoke: (id) => {
      sessions.revoke(id);
      hub.revokeSession(id);
      emit();
    },
  };
  const sim = new SimulatorManager(settings, hub, logger, opts.simulator ?? (process.env.OPEN_EFB_SIM?.trim() === "mock" ? "mock" : "fsuipc"));
  // GSX is a local, read-only side link. It never fails the EFB: with GSX absent the manager just
  // parks on an "unavailable" status and everything else keeps running.
  const gsx = new GsxManager({ hub, logger, locator: opts.gsxLocator ?? localGsxLocator() });
  hub.extraGreeting = () => gsx.message();
  const app = createApp({
    version,
    startedAt: Date.now(),
    settings,
    logger,
    webDir: opts.webDir,
    fetch: opts.fetch,
    auth,
    telemetry: () => sim.message(),
    gsx: () => gsx.status(),
    detectSims: opts.detectSims,
    detectFsuipc: opts.detectFsuipc,
    probePort: opts.probePort,
  });

  let srv: Server | null = null;
  let host: string | null = null;
  let port: number | null = null;
  const lan = () => settings.get().lanAccessEnabled;

  const upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const reject = (code: string) => {
      socket.write(`HTTP/1.1 ${code}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/ws" || !hostAllowed(req.headers.host, lan()) || !originAllowed(req.headers.origin, lan())) return reject("403 Forbidden");
    const id = identify(req, auth);
    if (!id) return reject("401 Unauthorized");
    hub.accept(req, socket, head, id.role === "client" ? id.session.id : null);
  };

  const bind = (listenPort: number) =>
    new Promise<void>((resolve, reject) => {
      const bindHost = lan() ? "0.0.0.0" : "127.0.0.1";
      const s = app.listen(listenPort, bindHost);
      s.on("upgrade", upgrade);
      s.once("error", reject);
      s.once("listening", () => {
        s.removeListener("error", reject);
        s.on("error", (err) => logger.error({ err }, "http server error"));
        srv = s;
        host = bindHost;
        port = (s.address() as AddressInfo).port;
        logger.info({ host, port }, "server listening");
        resolve();
      });
    });

  const unbind = async () => {
    const s = srv;
    if (!s) return;
    srv = null;
    hub.dropAll();
    await new Promise<void>((resolve) => {
      s.close(() => resolve());
      s.closeAllConnections();
    });
  };

  const stop = async () => {
    if (!srv) return;
    await sim.stop();
    await gsx.stop();
    await unbind();
    pairing.close();
    logger.info("server stopped");
    emit();
  };

  return {
    settings,
    logger,
    logs: buffer,
    isRunning: () => srv !== null,
    stop,
    async start() {
      if (srv) throw new Error("server already running");
      if (lan()) pairing.open();
      await bind(opts.port ?? settings.get().port);
      await sim.start()
      gsx.start();
      emit();
      return { host: host!, port: port!, url: `http://localhost:${port}` };
    },
    async dispose() {
      await stop();
      await sim.dispose()
      await gsx.stop();
      hub.dispose();
      db.close();
      await closeLogger();
    },
    access: {
      state: () => ({
        running: srv !== null,
        lanEnabled: lan(),
        host,
        port: srv ? port : null,
        localUrl: srv ? `http://localhost:${port}` : null,
        lanUrls: srv && lan() ? lanAddresses().map((ip) => `http://${ip}:${port}`) : [],
        pairing: pairing.current(),
        clients: sessions.list().map((s) => ({ id: s.id, label: s.label, ip: s.ip, lastSeen: s.lastSeen, connected: hub.connectedSessions().has(s.id) })),
      }),
      async setLan(enabled) {
        if (enabled === lan()) return;
        settings.update({ lanAccessEnabled: enabled });
        logger.info({ enabled }, "LAN access changed");
        if (enabled) pairing.open();
        else pairing.close();
        if (srv && port !== null) {
          const keep = port;
          await unbind();
          await bind(keep);
        }
        emit();
      },
      rotateCode: () => pairing.rotate(),
      revoke: (id) => auth.revoke(id),
      revokeAll: () => {
        for (const id of sessions.revokeAll()) hub.revokeSession(id);
        emit();
      },
      onChange(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    },
  };
}
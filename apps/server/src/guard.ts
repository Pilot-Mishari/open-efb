import os from "node:os";
import type { NextFunction, Request, Response } from "express";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function isLoopback(addr: string | undefined): boolean {
  return !!addr && LOOPBACK.has(addr);
}

/** Hostnames this server answers to. Anything else is refused (DNS-rebinding defence). */
export function allowedHostnames(lanEnabled: boolean): Set<string> {
  const hosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (lanEnabled) {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const i of list ?? []) if (i.family === "IPv4" && !i.internal) hosts.add(i.address);
    }
  }
  return hosts;
}

function hostnameOf(hostHeader: string): string {
  // Strip port; keep bracketed IPv6 intact.
  if (hostHeader.startsWith("[")) return hostHeader.slice(0, hostHeader.indexOf("]") + 1);
  return hostHeader.split(":")[0] ?? "";
}

/** Rejects requests whose Host header is not one of ours. */
export function hostGuard(getLanEnabled: () => boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const host = req.headers.host;
    if (!host || !allowedHostnames(getLanEnabled()).has(hostnameOf(host).toLowerCase())) {
      res.status(421).json({ error: "misdirected_request" });
      return;
    }
    next();
  };
}

/** For state-changing methods: if an Origin is sent it must match our own allowed hosts. */
export function originGuard(getLanEnabled: () => boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (origin) {
      let ok = false;
      try {
        const host = new URL(origin).host; // includes brackets for IPv6, excludes nothing else we care about
        ok = allowedHostnames(getLanEnabled()).has(hostnameOf(host).toLowerCase());
      } catch {
        ok = false;
      }
      if (!ok) {
        res.status(403).json({ error: "bad_origin" });
        return;
      }
    }
    next();
  };
}

/** Administrative routes are available only from the machine running the app. */
export function requireLoopback(req: Request, res: Response, next: NextFunction): void {
  if (!isLoopback(req.socket.remoteAddress)) {
    res.status(403).json({ error: "admin_local_only" });
    return;
  }
  next();
}

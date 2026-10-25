import os from "node:os";
import type { NextFunction, Request, Response } from "express";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function isLoopback(addr: string | undefined): boolean {
  return !!addr && LOOPBACK.has(addr);
}

const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
let cached = { at: 0, ips: [] as string[] };

export function lanAddresses(now: number = Date.now()): string[] {
  if (now - cached.at > 5000) {
    const ips: string[] = [];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const i of list ?? []) if (i.family === "IPv4" && !i.internal) ips.push(i.address);
    }
    ips.sort((a, b) => Number(PRIVATE.test(b)) - Number(PRIVATE.test(a)));
    cached = { at: now, ips };
  }
  return cached.ips;
}

export function allowedHostnames(lanEnabled: boolean): Set<string> {
  const hosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (lanEnabled) for (const ip of lanAddresses()) hosts.add(ip);
  return hosts;
}

function hostnameOf(hostHeader: string): string {
  if (hostHeader.startsWith("[")) return hostHeader.slice(0, hostHeader.indexOf("]") + 1);
  return hostHeader.split(":")[0] ?? "";
}

export function hostAllowed(hostHeader: string | undefined, lanEnabled: boolean): boolean {
  return !!hostHeader && allowedHostnames(lanEnabled).has(hostnameOf(hostHeader).toLowerCase());
}

export function originAllowed(origin: string | undefined, lanEnabled: boolean): boolean {
  if (!origin) return true;
  try {
    return hostAllowed(new URL(origin).host, lanEnabled);
  } catch {
    return false;
  }
}

export function hostGuard(getLanEnabled: () => boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!hostAllowed(req.headers.host, getLanEnabled())) {
      res.status(421).json({ error: "misdirected_request" });
      return;
    }
    next();
  };
}

export function originGuard(getLanEnabled: () => boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (!originAllowed(req.headers.origin, getLanEnabled())) {
      res.status(403).json({ error: "bad_origin" });
      return;
    }
    next();
  };
}

export function requireLoopback(req: Request, res: Response, next: NextFunction): void {
  if (!isLoopback(req.socket.remoteAddress)) {
    res.status(403).json({ error: "admin_local_only" });
    return;
  }
  next();
}
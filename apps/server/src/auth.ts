import type { IncomingMessage } from "node:http";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { Pairing } from "./pairing";
import type { SessionInfo, SessionStore } from "./sessions";

export const COOKIE = "efb_session";
const MAX_AGE_S = 30 * 24 * 3600;

export interface AuthDeps {
  sessions: SessionStore;
  pairing: Pairing;
  isLocal: (req: IncomingMessage) => boolean;
  changed: () => void;
  revoke: (id: string) => void;
}

export type Identity = { role: "local" } | { role: "client"; session: SessionInfo };

export function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function identify(req: IncomingMessage, deps: AuthDeps): Identity | null {
  if (deps.isLocal(req)) return { role: "local" };
  const token = readCookie(req.headers.cookie, COOKIE);
  const session = token ? deps.sessions.verify(token) : null;
  return session ? { role: "client", session } : null;
}

function labelFor(ua = ""): string {
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  if (/Windows/.test(ua)) return "Windows browser";
  if (/Mac OS X/.test(ua)) return "Mac browser";
  return "Browser";
}

const cookie = (value: string, maxAge: number) => `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

export function authRoutes(deps: AuthDeps): Router {
  const r = Router();

  r.get("/session", (req, res) => {
    const id = identify(req, deps);
    res.json({ authenticated: !!id, role: id?.role ?? null, label: id?.role === "client" ? id.session.label : null });
  });

  r.post("/pair", (req, res) => {
    if (deps.isLocal(req)) {
      res.json({ ok: true, local: true });
      return;
    }
    const parsed = z.object({ code: z.string().regex(/^\d{4}$/) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_code" });
      return;
    }
    const result = deps.pairing.attempt(parsed.data.code);
    if (!result.ok) {
      if (result.reason === "locked") res.status(429).json({ error: "pairing_locked", retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000) });
      else if (result.reason === "closed") res.status(403).json({ error: "pairing_closed" });
      else res.status(401).json({ error: "invalid_code" });
      return;
    }
    const { token } = deps.sessions.create(labelFor(req.headers["user-agent"]), req.socket.remoteAddress ?? null);
    res.setHeader("Set-Cookie", cookie(token, MAX_AGE_S));
    deps.changed();
    res.json({ ok: true });
  });

  r.post("/session/logout", (req, res) => {
    const id = identify(req, deps);
    if (id?.role === "client") deps.revoke(id.session.id);
    res.setHeader("Set-Cookie", cookie("", 0));
    res.json({ ok: true });
  });

  return r;
}

export const requireAuth = (deps: AuthDeps) => (req: Request, res: Response, next: NextFunction): void => {
  if (identify(req, deps)) return next();
  res.status(401).json({ error: "unauthorized" });
};

export const requireLocal = (deps: AuthDeps) => (req: Request, res: Response, next: NextFunction): void => {
  if (deps.isLocal(req)) return next();
  res.status(403).json({ error: "admin_local_only" });
};
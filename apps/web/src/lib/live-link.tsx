import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { GsxMessageSchema, TelemetryMessageSchema, type GsxMessage, type TelemetryMessage } from "@open-efb/shared";
import { useAuth } from "./auth-context";

export type LinkState = "connecting" | "open" | "reconnecting";

export interface TelemetryFeed {
  /** Latest telemetry message from the server, or null before the first one arrives. */
  message: TelemetryMessage | null;
  /** Local clock (ms) when that message arrived. Used with message.serverTime to measure age without trusting clock sync. */
  receivedAt: number | null;
}

/** GSX state rides the same socket as telemetry but only arrives when GSX itself changed. */
export interface GsxFeed {
  message: GsxMessage | null;
  receivedAt: number | null;
}

const LinkCtx = createContext<LinkState>("connecting");
const FeedCtx = createContext<TelemetryFeed>({ message: null, receivedAt: null });
const GsxCtx = createContext<GsxFeed>({ message: null, receivedAt: null });

export function LiveLinkProvider({ children }: { children: ReactNode }) {
  const { refresh } = useAuth();
  const [state, setState] = useState<LinkState>("connecting");
  const [feed, setFeed] = useState<TelemetryFeed>({ message: null, receivedAt: null });
  const [gsx, setGsx] = useState<GsxFeed>({ message: null, receivedAt: null });

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer = 0;
    let tries = 0;
    let stopped = false;
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

    const connect = () => {
      setState(tries === 0 ? "connecting" : "reconnecting");
      const sock = new WebSocket(url);
      ws = sock;
      sock.onopen = () => {
        tries = 0;
        setState("open");
      };
      sock.onmessage = (e) => {
        if (typeof e.data !== "string") return;
        try {
          const raw = JSON.parse(e.data);
          const parsed = TelemetryMessageSchema.safeParse(raw);
          if (parsed.success) {
            setFeed({ message: parsed.data, receivedAt: Date.now() });
            return;
          }
          const parsedGsx = GsxMessageSchema.safeParse(raw);
          if (parsedGsx.success) setGsx({ message: parsedGsx.data, receivedAt: Date.now() });
        } catch {
          /* not JSON, ignore */
        }
      };
      sock.onclose = (e) => {
        if (stopped || ws !== sock) return;
        if (e.code === 4001) return void refresh();
        tries++;
        setState("reconnecting");
        timer = window.setTimeout(connect, Math.min(1000 * 2 ** (tries - 1), 15_000));
      };
      sock.onerror = () => sock.close();
    };

    const wake = () => {
      if (document.visibilityState === "visible" && (!ws || ws.readyState === WebSocket.CLOSED)) {
        window.clearTimeout(timer);
        connect();
      }
    };

    connect();
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
      ws?.close();
    };
  }, [refresh]);

  return (
    <LinkCtx.Provider value={state}>
      <FeedCtx.Provider value={feed}>
        <GsxCtx.Provider value={gsx}>{children}</GsxCtx.Provider>
      </FeedCtx.Provider>
    </LinkCtx.Provider>
  );
}

export const useLiveLink = (): LinkState => useContext(LinkCtx);
export const useTelemetryFeed = (): TelemetryFeed => useContext(FeedCtx);
export const useGsxFeed = (): GsxFeed => useContext(GsxCtx);
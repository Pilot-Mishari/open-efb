import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth-context";

export type LinkState = "connecting" | "open" | "reconnecting";

const LinkCtx = createContext<LinkState>("connecting");

export function LiveLinkProvider({ children }: { children: ReactNode }) {
  const { refresh } = useAuth();
  const [state, setState] = useState<LinkState>("connecting");

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

  return <LinkCtx.Provider value={state}>{children}</LinkCtx.Provider>;
}

export const useLiveLink = (): LinkState => useContext(LinkCtx);
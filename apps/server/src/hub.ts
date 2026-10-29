import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";

interface Peer {
  sessionId: string | null;
  alive: boolean;
}

export class ClientHub {
  private wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  private peers = new Map<WebSocket, Peer>();
  private listeners = new Set<() => void>();
  private timer: NodeJS.Timeout;

  constructor(
    private readonly version: string,
    heartbeatMs = 15_000,
  ) {
    
    this.timer = setInterval(() => this.beat(), heartbeatMs);
    this.timer.unref();
    
  }

  greeting: (() => unknown) | null = null;
  /** Extra state a manager wants every new client to have straight away (GSX status), so a freshly
   * opened screen never has to poll to learn what is already known. */
  extraGreeting: (() => unknown) | null = null;

  accept(req: IncomingMessage, socket: Duplex, head: Buffer, sessionId: string | null): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      const peer: Peer = { sessionId, alive: true };
      this.peers.set(ws, peer);
      ws.on("pong", () => void (peer.alive = true));
      ws.on("message", () => {});
      ws.on("error", () => ws.terminate());
      ws.on("close", () => {
        this.peers.delete(ws);
        this.notify();
      });
      ws.send(JSON.stringify({ type: "hello", version: this.version, serverTime: Date.now() }));
      if (this.greeting) ws.send(JSON.stringify(this.greeting()));
      if (this.extraGreeting) ws.send(JSON.stringify(this.extraGreeting()));
      this.notify();
    });
  }

  connectedSessions(): Set<string> {
    const ids = new Set<string>();
    for (const p of this.peers.values()) if (p.sessionId) ids.add(p.sessionId);
    return ids;
  }

  broadcast(message: unknown): void {
    const data = JSON.stringify(message);
    for (const ws of this.peers.keys()) if (ws.readyState === ws.OPEN) ws.send(data);
  }

  revokeSession(id: string): void {
    for (const [ws, p] of this.peers) {
      if (p.sessionId !== id) continue;
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "revoked" }));
      ws.close(4001, "revoked");
    }
  }

  dropAll(): void {
    for (const ws of this.peers.keys()) ws.close(1001, "going away");
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  dispose(): void {
    clearInterval(this.timer);
    for (const ws of this.peers.keys()) ws.terminate();
    this.wss.close();
  }

  private beat(): void {
    for (const [ws, p] of this.peers) {
      if (!p.alive) {
        ws.terminate();
        continue;
      }
      p.alive = false;
      ws.ping();
    }
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}
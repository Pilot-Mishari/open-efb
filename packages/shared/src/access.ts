export interface AccessClient {
  id: string;
  label: string;
  ip: string | null;
  lastSeen: number;
  connected: boolean;
}

export interface AccessState {
  running: boolean;
  lanEnabled: boolean;
  host: string | null;
  port: number | null;
  localUrl: string | null;
  lanUrls: string[];
  pairing: { code: string; expiresAt: number } | null;
  clients: AccessClient[];
}
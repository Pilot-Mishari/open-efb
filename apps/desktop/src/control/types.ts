import type { AccessState } from "@open-efb/shared";

export interface ControlState {
  version: string;
  access: AccessState;
  qr: string | null;
  logs: string[];
  simulator: string;
}

export interface ControlApi {
  getState(): Promise<ControlState>;
  onState(cb: (state: ControlState) => void): void;
  setLan(enabled: boolean): Promise<void>;
  rotateCode(): Promise<void>;
  revoke(id: string): Promise<void>;
  revokeAll(): Promise<void>;
  openApp(): Promise<void>;
}
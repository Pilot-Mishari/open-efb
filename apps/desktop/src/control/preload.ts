import { contextBridge, ipcRenderer } from "electron";
import type { ControlApi, ControlState } from "./types";

const api: ControlApi = {
  getState: () => ipcRenderer.invoke("control:get"),
  onState: (cb) => {
    ipcRenderer.on("control:state", (_e, state: ControlState) => cb(state));
  },
  setLan: (enabled) => ipcRenderer.invoke("control:set-lan", enabled),
  rotateCode: () => ipcRenderer.invoke("control:rotate"),
  revoke: (id) => ipcRenderer.invoke("control:revoke", id),
  revokeAll: () => ipcRenderer.invoke("control:revoke-all"),
  openApp: () => ipcRenderer.invoke("control:open-app"),
};

contextBridge.exposeInMainWorld("efbControl", api);
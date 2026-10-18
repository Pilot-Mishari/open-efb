import { contextBridge, ipcRenderer } from "electron";

// Deliberately tiny surface: no filesystem, shell or arbitrary IPC access.
contextBridge.exposeInMainWorld("efb", {
  platform: process.platform,
  getServerStatus: (): Promise<{ running: boolean; url: string | null }> => ipcRenderer.invoke("efb:server-status"),
});

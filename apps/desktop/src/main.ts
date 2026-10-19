import path from "node:path";
import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, session, shell, type IpcMainInvokeEvent } from "electron";
import { toDataURL } from "qrcode";
import { createEfbServer } from "@open-efb/server";
import type { ControlState } from "./control/types";

const isDev = !app.isPackaged;
const EXTERNAL_HOSTS = new Set(["chartfox.org", "www.chartfox.org", "navigraph.com", "www.navigraph.com", "charts.navigraph.com"]);
let win: BrowserWindow | null = null;
let control: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverUrl: string | null = null;
let quitting = false;
let disposed = false;
let refreshTray = () => {};
let qrCache: { url: string; data: string } | null = null;

const webDir = isDev ? path.resolve(__dirname, "../../web/dist") : path.join(process.resourcesPath, "web");
const iconPath = isDev ? path.resolve(__dirname, "../build/icon.png") : path.join(process.resourcesPath, "icon.png");

const server = createEfbServer({
  dataDir: path.join(app.getPath("userData"), "data"),
  webDir,
  version: app.getVersion(),
});

async function qrFor(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  if (qrCache?.url !== url) qrCache = { url, data: await toDataURL(url, { margin: 1, width: 360, color: { dark: "#0d1c42", light: "#fcf1d0" } }) };
  return qrCache.data;
}

function formatLog(line: string): string {
  try {
    const o = JSON.parse(line) as { time?: number; level?: number; msg?: string };
    const level = (o.level ?? 30) >= 50 ? "ERROR" : o.level === 40 ? "WARN" : "INFO";
    return `${new Date(o.time ?? 0).toTimeString().slice(0, 8)} ${level} ${o.msg ?? ""}`;
  } catch {
    return line;
  }
}

async function controlState(): Promise<ControlState> {
  const access = server.access.state();
  return { version: app.getVersion(), access, qr: await qrFor(access.lanUrls[0]), logs: server.logs.lines().slice(-60).map(formatLog) };
}

async function pushControl(): Promise<void> {
  if (control && !control.isDestroyed() && control.isVisible()) control.webContents.send("control:state", await controlState());
}

function createWindow(url: string): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0d1c42",
    title: "Open EFB",
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  win.once("ready-to-show", () => win?.show());
  win.webContents.on("will-navigate", (e, target) => {
    if (new URL(target).origin !== new URL(url).origin) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    try {
      const u = new URL(target);
      if (u.protocol === "https:" && EXTERNAL_HOSTS.has(u.hostname)) void shell.openExternal(target);
    } catch {
      /* ignore malformed URLs */
    }
    return { action: "deny" };
  });
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win?.hide();
    }
  });
  void win.loadURL(url);
}

function showWindow(): void {
  if (!serverUrl) return;
  if (!win) createWindow(serverUrl);
  win?.show();
  win?.focus();
}

function showControl(): void {
  if (control && !control.isDestroyed()) {
    control.show();
    control.focus();
    return;
  }
  control = new BrowserWindow({
    width: 500,
    height: 780,
    minWidth: 440,
    minHeight: 560,
    backgroundColor: "#0d1c42",
    title: "Open EFB",
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, "control-preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  control.setMenuBarVisibility(false);
  control.webContents.on("will-navigate", (e) => e.preventDefault());
  control.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  control.once("ready-to-show", () => control?.show());
  control.on("closed", () => {
    control = null;
  });
  void control.loadFile(path.join(__dirname, "control.html"));
}

function buildTray(): void {
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip("Open EFB");
  refreshTray = () => {
    const a = server.access.state();
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open EFB", click: showWindow },
        { label: "Connect a tablet\u2026", click: showControl },
        { type: "separator" },
        { label: a.running ? `Server running at ${serverUrl}` : "Server stopped", enabled: false },
        { label: `Tablet access: ${a.lanEnabled ? `on, ${a.clients.filter((c) => c.connected).length} connected` : "off"}`, enabled: false },
        { type: "separator" },
        {
          label: a.running ? "Stop server" : "Start server",
          click: async () => {
            if (server.isRunning()) await server.stop();
            else serverUrl = (await server.start()).url;
            refreshTray();
          },
        },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ]),
    );
  };
  refreshTray();
  tray.on("click", showWindow);
}

const fromControl = (e: IpcMainInvokeEvent): boolean => !!control && !control.isDestroyed() && e.sender === control.webContents;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.on("before-quit", () => {
    quitting = true;
  });

  void app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    ipcMain.handle("efb:server-status", () => ({ running: server.isRunning(), url: serverUrl }));
    ipcMain.handle("control:get", (e) => (fromControl(e) ? controlState() : null));
    ipcMain.handle("control:set-lan", async (e, enabled: unknown) => {
      if (fromControl(e) && typeof enabled === "boolean") await server.access.setLan(enabled);
    });
    ipcMain.handle("control:rotate", (e) => void (fromControl(e) && server.access.rotateCode()));
    ipcMain.handle("control:revoke", (e, id: unknown) => void (fromControl(e) && typeof id === "string" && server.access.revoke(id)));
    ipcMain.handle("control:revoke-all", (e) => void (fromControl(e) && server.access.revokeAll()));
    ipcMain.handle("control:open-app", (e) => void (fromControl(e) && showWindow()));

    server.access.onChange(() => {
      refreshTray();
      void pushControl();
    });
    setInterval(() => void pushControl(), 3000).unref();

    try {
      serverUrl = (await server.start()).url;
    } catch (err) {
      server.logger.error({ err }, "failed to start server");
      app.quit();
      return;
    }
    buildTray();
    createWindow(serverUrl);
  });

  app.on("window-all-closed", () => {});
  app.on("will-quit", (e) => {
    if (disposed) return;
    e.preventDefault();
    disposed = true;
    void server.dispose().finally(() => app.quit());
  });
}
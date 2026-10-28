import path from "node:path";
import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, session, shell, type IpcMainInvokeEvent } from "electron";
import { toDataURL } from "qrcode";
import { createEfbServer } from "@open-efb/server";
import type { ControlState } from "./control/types";
import { SIM_LABEL, SimWatcher, listProcessNames } from "./sim-watch";

const isDev = !app.isPackaged;
/** Set by the Windows login item so the EFB starts in the tray without opening a window. */
const startHidden = process.argv.includes("--background");
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

const watcher = new SimWatcher({
  list: listProcessNames,
  onStarted: (variants) => {
    server.logger.info({ simulator: variants }, "simulator detected");
    refreshTray();
    void pushControl();
    if (server.settings.get().autoLaunchOnSimulator) showWindow(false);
  },
  onStopped: () => {
    server.logger.info({}, "simulator closed");
    refreshTray();
    void pushControl();
  },
  onError: (err) => server.logger.debug({ err }, "simulator process check failed"),
});

function simStatus(): string {
  if (!server.settings.get().autoLaunchOnSimulator) return "Detection is off";
  const found = watcher.current();
  return found.length ? `${found.map((v) => SIM_LABEL[v]).join(" and ")} detected` : "Waiting for MSFS to start";
}

function applyAutoLaunch(on: boolean): void {
  if (on) watcher.start();
  else watcher.stop();
}

function applyStartWithWindows(on: boolean): void {
  if (!app.isPackaged || process.platform !== "win32") return;
  app.setLoginItemSettings({ openAtLogin: on, args: ["--background"] });
}

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
  return { version: app.getVersion(), access, qr: await qrFor(access.lanUrls[0]), logs: server.logs.lines().slice(-60).map(formatLog), simulator: simStatus() };
}

async function pushControl(): Promise<void> {
  if (control && !control.isDestroyed() && control.isVisible()) control.webContents.send("control:state", await controlState());
}

function createWindow(url: string, focus = true): void {
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
  win.once("ready-to-show", () => (focus ? win?.show() : win?.showInactive()));
  win.webContents.on("will-navigate", (e, target) => {
    if (new URL(target).origin !== new URL(url).origin) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    try {
      const u = new URL(target);
      if (u.protocol === "https:" && EXTERNAL_HOSTS.has(u.hostname)) void shell.openExternal(target);
      // VATSIM Listen cannot be embedded (its sign-in page refuses to be framed), so the web app
      // opens it as its own window and keeps that window on the tuned station. It shares this
      // window's session, so the VATSIM sign-in done once is remembered.
      else if (u.protocol === "https:" && u.hostname === "listen.vatsim.net") {
        return { action: "allow", overrideBrowserWindowOptions: { width: 1100, height: 800, autoHideMenuBar: true } };
      }
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

/** focus=false shows the window without taking focus, so an automatic launch never pulls the simulator out of focus. */
function showWindow(focus = true): void {
  if (!serverUrl) return;
  if (!win) createWindow(serverUrl, focus);
  if (focus) {
    win?.show();
    win?.focus();
  } else win?.showInactive();
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
    const st = server.settings.get();
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open EFB", click: () => showWindow() },
        { label: "Connect a tablet\u2026", click: showControl },
        { type: "separator" },
        { label: a.running ? `Server running at ${serverUrl}` : "Server stopped", enabled: false },
        { label: `Tablet access: ${a.lanEnabled ? `on, ${a.clients.filter((c) => c.connected).length} connected` : "off"}`, enabled: false },
        { label: `Simulator: ${simStatus()}`, enabled: false },
        { type: "separator" },
        { label: "Open the EFB when MSFS starts", type: "checkbox", checked: st.autoLaunchOnSimulator, click: (i) => void server.settings.update({ autoLaunchOnSimulator: i.checked }) },
        { label: "Start Open EFB with Windows", type: "checkbox", checked: st.startWithWindows, enabled: app.isPackaged, click: (i) => void server.settings.update({ startWithWindows: i.checked }) },
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
  tray.on("click", () => showWindow());
}

const fromControl = (e: IpcMainInvokeEvent): boolean => !!control && !control.isDestroyed() && e.sender === control.webContents;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.on("before-quit", () => {
    quitting = true;
    watcher.stop();
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
      dialog.showErrorBox(
        "Open EFB could not start",
        `The local server failed to start. Another program may be using port ${server.settings.get().port}, or another copy of Open EFB may still be shutting down.\n\n${err instanceof Error ? err.message : String(err)}\n\nLog folder: ${path.join(app.getPath("userData"), "data", "logs")}`,
      );
      app.quit();
      return;
    }
    const initial = server.settings.get();
    applyStartWithWindows(initial.startWithWindows);
    applyAutoLaunch(initial.autoLaunchOnSimulator);
    server.settings.onChange((next, prev) => {
      if (next.startWithWindows !== prev.startWithWindows) applyStartWithWindows(next.startWithWindows);
      if (next.autoLaunchOnSimulator !== prev.autoLaunchOnSimulator) applyAutoLaunch(next.autoLaunchOnSimulator);
      if (next.startWithWindows !== prev.startWithWindows || next.autoLaunchOnSimulator !== prev.autoLaunchOnSimulator) {
        refreshTray();
        void pushControl();
      }
    });
    buildTray();
    if (!startHidden) createWindow(serverUrl);
  });

  app.on("window-all-closed", () => {});
  app.on("will-quit", (e) => {
    if (disposed) return;
    e.preventDefault();
    disposed = true;
    void server.dispose().finally(() => app.quit());
  });
}
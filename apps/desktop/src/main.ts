import path from "node:path";
import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, session } from "electron";
import { createEfbServer } from "@open-efb/server";

const isDev = !app.isPackaged;
const EXTERNAL_HOSTS = new Set(["chartfox.org", "www.chartfox.org", "navigraph.com", "www.navigraph.com", "charts.navigraph.com", "www.simbrief.com"]);
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverUrl: string | null = null;
let quitting = false;
let disposed = false;

const webDir = isDev ? path.resolve(__dirname, "../../web/dist") : path.join(process.resourcesPath, "web");
const iconPath = isDev ? path.resolve(__dirname, "../build/icon.png") : path.join(process.resourcesPath, "icon.png");

const server = createEfbServer({
  dataDir: path.join(app.getPath("userData"), "data"),
  webDir,
  version: app.getVersion(),
});

function createWindow(url: string): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#08171b",
    title: "Open EFB",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.once("ready-to-show", () => win?.show());
  // Only our own origin may load in this window; everything else is blocked.
  win.webContents.on("will-navigate", (e, target) => {
    if (new URL(target).origin !== new URL(url).origin) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
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

function buildTray(): void {
  const img = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip("Open EFB");
  const refresh = () =>
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open EFB", click: showWindow },
        { label: server.isRunning() ? `Server running at ${serverUrl}` : "Server stopped", enabled: false },
        { type: "separator" },
        {
          label: server.isRunning() ? "Stop server" : "Start server",
          click: async () => {
            if (server.isRunning()) await server.stop();
            else serverUrl = (await server.start()).url;
            refresh();
          },
        },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ]),
    );
  refresh();
  tray.on("click", showWindow);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.on("before-quit", () => {
    quitting = true;
  });

  void app.whenReady().then(async () => {
    // Deny every permission request (camera, geolocation, notifications, ...).
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    ipcMain.handle("efb:server-status", () => ({ running: server.isRunning(), url: serverUrl }));

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

  app.on("window-all-closed", () => {
    /* keep running in the tray */
  });
  app.on("will-quit", (e) => {
    if (disposed) return;
    e.preventDefault();
    disposed = true;
    void server.dispose().finally(() => app.quit());
  });
}

import fs from "node:fs";
import path from "node:path";
import { BrowserWindow } from "electron";

/** The launch splash stays up at least this long so the message is readable even when the
 * update check finishes instantly (no network, dev build). */
const MIN_VISIBLE_MS = 3_000;
/** …and never longer than this, so a slow download cannot hold the app hostage. */
const MAX_VISIBLE_MS = 5_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Shows a frameless launch splash: the passcode-screen photograph behind a centred loading box
 * that reads "Checking for updates…". The caller keeps it on screen with hideSplashAfter() while
 * the server boots and the updater runs its first check, then opens the main window.
 */
export function showSplash(webDir: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 600,
    height: 380,
    frame: false,
    resizable: false,
    movable: false,
    center: true,
    show: false,
    backgroundColor: "#0d1c42",
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml(webDir))}`).catch(() => undefined);
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) win.show();
  });
  return win;
}

/** Keeps the splash on screen until the update check settles, clamped to 3–5 seconds total. */
export async function hideSplashAfter(splash: BrowserWindow, updateCheck: Promise<void>): Promise<void> {
  await Promise.race([Promise.all([updateCheck, sleep(MIN_VISIBLE_MS)]), sleep(MAX_VISIBLE_MS)]);
  if (!splash.isDestroyed()) splash.close();
}

function splashHtml(webDir: string): string {
  // The photograph is embedded as a data: URI so the page needs no file access at all.
  let background = "#0d1c42";
  try {
    const photo = fs.readFileSync(path.join(webDir, "passcode.webp")).toString("base64");
    background = `url("data:image/webp;base64,${photo}") center / cover no-repeat, #0d1c42`;
  } catch {
    /* web build not present yet: the plain panel colour is fine */
  }
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Open EFB</title>
<style>
  * { margin: 0; }
  html, body { height: 100%; overflow: hidden; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #e8eefb; background: ${background}; }
  .tint { position: fixed; inset: 0; background: linear-gradient(to bottom, rgb(13 28 66 / 0.6), rgb(13 28 66 / 0.9)); }
  .box { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); min-width: 300px;
    padding: 28px 40px; text-align: center; background: rgb(13 28 66 / 0.78);
    border: 1px solid rgb(255 255 255 / 0.14); border-radius: 18px;
    box-shadow: 0 16px 48px rgb(0 0 0 / 0.5); backdrop-filter: blur(10px); }
  .spinner { width: 36px; height: 36px; margin: 0 auto 16px; border-radius: 50%;
    border: 3px solid rgb(255 255 255 / 0.16); border-top-color: #8fb0ff;
    animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  h1 { font-size: 16px; font-weight: 600; }
  p { margin-top: 8px; font-size: 12.5px; color: rgb(232 238 252 / 0.65); }
</style>
</head>
<body>
  <div class="tint"></div>
  <div class="box"><div class="spinner"></div><h1>Checking for updates…</h1><p>Open EFB</p></div>
</body>
</html>`;
}

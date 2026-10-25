# Open EFB: installation and user guide

**Status of this guide.** It was written from the source code. The installer, the simulator detection and everything that needs Windows, MSFS or FSUIPC7 have **not been run on a real Windows PC with a simulator yet**. Statements that could not be confirmed from the code are marked **[Unverified]**. Please report anything that turns out to be wrong.

## Contents
- [A. Requirements](#a-requirements)
- [B. Installation](#b-installation)
- [C. First-time setup](#c-first-time-setup)
- [D. Simulator integration](#d-simulator-integration)
- [E. Everyday use](#e-everyday-use)
- [F. Troubleshooting](#f-troubleshooting)
- [G. Updating and uninstalling](#g-updating-and-uninstalling)
- [H. Developer and release instructions](#h-developer-and-release-instructions)
- [Manual test checklist](#manual-test-checklist)

---

## A. Requirements

| Item | Needed? | Notes |
|---|---|---|
| Windows 10 or 11, 64-bit | Yes | The installer is built for x64 only. |
| Microsoft Flight Simulator 2020 or 2024 | Optional | Open EFB also runs without a simulator. |
| FSUIPC7 **and** the FSUIPC WebSocket Server | Only for live flight data | Not needed to open the EFB automatically. Neither is bundled with Open EFB; install them from their authors. Check their own pages for licence terms and for the versions that support MSFS 2024. |
| Node.js, .NET or other runtimes | No | Electron brings everything the app needs. |
| Wi-Fi or Ethernet network | Only for tablets | The tablet and the PC must be on the same local network. |
| Internet | Optional | Needed for SimBrief, VATSIM data, chart websites and map tiles. |

**Network for a tablet.** Open EFB listens on TCP port **4780** by default. By default it only accepts connections from the PC itself; tablet access is off until you switch it on (see C).

---

## B. Installation

### Getting the installer
Download `Open-EFB-Setup-<version>.exe` from the **Releases** page of the project's repository, together with `SHA256SUMS.txt`. **[Unverified]** The repository address is not recorded in the source tree, so use the link from wherever you found the project.

### Windows security warning
The installer is **not code-signed** (no signing certificate is configured), so Windows SmartScreen may show "Windows protected your PC". That is expected for unsigned software, but it is not proof the file is safe. Before running it:

1. Make sure you downloaded it from the project's own Releases page.
2. Check the file against `SHA256SUMS.txt`. In PowerShell:
   ```powershell
   Get-FileHash .\Open-EFB-Setup-0.1.0.exe -Algorithm SHA256
   ```
   The hash must match the one in `SHA256SUMS.txt` exactly.
3. Only if both checks pass, choose **More info**, then **Run anyway**. If anything does not match, delete the file.

Do not turn off SmartScreen or your antivirus to install it.

### Steps
1. Run the installer. It installs **for your Windows account only** and does **not** ask for administrator rights.
2. Choose the install folder, or keep the default.
3. Finish. The option to start Open EFB straight away is on by default.

What the installer does:
- Copies the app to the install folder and adds a **Start Menu** shortcut named "Open EFB".
- Does **not** create a desktop shortcut. (An optional desktop-shortcut checkbox is not implemented yet; pin the app from the Start Menu if you want one.)
- Adds an entry to **Settings > Apps** for uninstalling.
- Does not install FSUIPC, MSFS add-ons or any other third-party software.

Your settings, paired tablets and logs are **not** stored in the install folder, so upgrades do not touch them.

### Check that it worked
- "Open EFB" appears in the Start Menu and opens a window.
- An Open EFB icon appears in the system tray (click the `^` arrow near the clock if it is hidden).
- In the window, the left bar shows "Server online" (on a wide window; a narrow one shows only coloured dots).

**Where data lives [Unverified on Windows]:**
- `%APPDATA%\Open EFB\data\open-efb.sqlite` (settings and paired devices)
- `%APPDATA%\Open EFB\data\logs\open-efb.log` (diagnostic log)

---

## C. First-time setup

### Launch
Open **Open EFB** from the Start Menu. Closing the window does not quit the app; it keeps running in the tray. Use the tray icon to bring the window back.

### Pair a tablet
1. Right-click the tray icon and choose **Connect a tablet...**.
2. Switch on **Allow tablets on my network**. Windows Firewall may ask for permission: allow Open EFB on **private** networks only.
3. The window shows an address such as `http://192.168.1.20:4780`, a QR code, and a 4-digit **pairing code**.
4. On the tablet, connected to the same Wi-Fi, scan the QR code or type the address into the browser.
5. The tablet shows the lock screen. Swipe up, enter the 4-digit code, and you are in. The code is only asked once for each tablet. The tablet then stays paired for up to 30 days of inactivity.

Good to know:
- The code changes every 5 minutes, and after each successful pairing. **New code** makes a fresh one.
- Five wrong attempts lock pairing for 1 minute (the wait doubles on repeated lockouts, up to 15 minutes) and the code changes.
- If the address does not work, the window lists other addresses your PC has; try those.
- On the PC itself you are never asked for a code.
- Pairing is only open while tablet access is switched on. Switch it off when you are not using it.
- **Disconnect** (per device) and **Disconnect all** in the same window remove tablets.

### Automatic launch with the simulator
Two settings (default shown):

| Setting | Default | What it does |
|---|---|---|
| Open the EFB when MSFS starts | **On** | Shows the EFB window when MSFS 2020 or 2024 is detected. |
| Start Open EFB with Windows | **Off** | Starts Open EFB in the tray, with no window, when you sign in to Windows. |

Change them in **Settings > Integrations > Simulator** (on the PC), or from the tray menu. "Start Open EFB with Windows" only works in the installed app, not when run from source.

**Important:** Open EFB can only notice the simulator while it is running. For fully automatic use, turn on **Start Open EFB with Windows**. Otherwise start Open EFB yourself before (or after) MSFS.

---

## D. Simulator integration

### How detection works
Open EFB checks the Windows process list (`tasklist`) for the simulator's program:

| Simulator | Program name |
|---|---|
| MSFS 2020 | `FlightSimulator.exe` |
| MSFS 2024 | `FlightSimulator2024.exe` |

**[Unverified]** These names come from public forum posts and the MSFS developer documentation; confirm them in Task Manager on your PC. They are listed in `apps/desktop/src/sim-watch.ts`.

- It checks every 5 seconds while waiting, every 10 seconds while the simulator runs. The check is a short background command, so it uses very little CPU.
- A start is only accepted after the program is seen on **two checks in a row**, and a stop after it is missing on **three in a row**. This stops flicker and duplicate triggers from starting things twice.
- When a start is confirmed, Open EFB writes "simulator detected" to its log and shows its window **without taking keyboard focus**, so the sim keeps focus.
- Only one copy of Open EFB can run. Starting a second copy just brings the first window forward.
- If MSFS is already running when Open EFB starts, it is treated as a new start.
- Closing MSFS is noticed after about 30 seconds. Starting it again opens the EFB window again.
- If you close the EFB window while the simulator keeps running, it is **not** reopened until the next simulator session.

**FSUIPC is not needed for this.** Detection does not talk to FSUIPC, so it works even if FSUIPC7 is missing. A running simulator program does not mean the sim is fully loaded, so connecting to flight data is handled separately (below).

### Live flight data
Telemetry comes from the **FSUIPC WebSocket Server** talking to FSUIPC7. Open EFB connects to it on this PC at `ws://127.0.0.1:2048/fsuipc/` (port **2048** by default).

Setup, for both MSFS 2020 and MSFS 2024:
1. Install FSUIPC7 for your simulator, and the FSUIPC WebSocket Server, from their authors. **[Unverified]** MSFS 2024 needs recent versions of both; check their release notes.
2. Start MSFS, then FSUIPC7, then the WebSocket Server (start order is not enforced by Open EFB, which keeps retrying).
3. Open EFB connects by itself. It retries with a growing delay (1 second up to 15 seconds), so it recovers whether it, FSUIPC or the simulator started first, and after a restart of any of them.

Open EFB does not install, modify or configure FSUIPC and never overwrites its settings.

### Confirm that it works
On the dashboard (**Home**), the **Simulator** card shows one of:

| Message | Meaning |
|---|---|
| Simulator link is off | Turned off in settings (`simulatorEnabled`). |
| Connecting to the simulator | Trying to reach the WebSocket Server. |
| Simulator not connected | The WebSocket Server cannot be reached. The text below it says to start FSUIPC7 and its WebSocket Server. |
| Connected, waiting for the simulator | Connected to FSUIPC but no flight data yet (the sim may still be loading). |
| Data is stale | Data stopped arriving. |
| Simulator connected | Live data is flowing. |

If there is no data, the app shows dashes. It never invents flight values. The tray menu shows "Simulator: MSFS 2020 detected" (or 2024, or "Waiting for MSFS to start").

---

## E. Everyday use

- **Start:** Start Menu > Open EFB, or let it start with Windows.
- **With MSFS:** start the simulator. Within roughly 5 to 15 seconds the EFB window appears (if "Open the EFB when MSFS starts" is on). Check the tray menu for "MSFS ... detected".
- **Tablet:** open the saved address in the tablet's browser. If it still has a valid pairing it goes straight in after the lock screen swipe.
- **Stop safely:** right-click the tray icon > **Quit**. This stops the server and flushes the log. Closing the window only hides it.
- **Without MSFS:** everything except live flight data works (briefing from SimBrief, charts links, VATSIM, CabinView and its map). Flight data fields show dashes.

---

## F. Troubleshooting

**Installer fails, or the app will not open.**
Re-download and check the SHA256 hash. If Open EFB opens and immediately closes, it shows an error box. The most common cause is that port 4780 is busy (below). The log is `%APPDATA%\Open EFB\data\logs\open-efb.log` **[Unverified]**.

**The EFB does not launch automatically.**
1. Is Open EFB running? Look for the tray icon. It can only react while running. Turn on **Start Open EFB with Windows**.
2. Is **Open the EFB when MSFS starts** on? (The tray menu shows "Simulator: Detection is off" if not.)
3. Did you close the window earlier in the same simulator session? It is not reopened until the next session; use the tray icon.
4. Does the tray say "Waiting for MSFS to start" while MSFS is running? See the next two items.

**MSFS 2020 is not detected.** Open Task Manager > Details while it is running and check the program name. Open EFB looks for `FlightSimulator.exe`. If your install shows a different name (for example a Steam or Store variant), report it.

**MSFS 2024 is not detected.** The same, with `FlightSimulator2024.exe`.

**FSUIPC missing or not connecting.** The Simulator card says "Simulator not connected". Check that FSUIPC7 **and** the FSUIPC WebSocket Server are both running, that the server uses port 2048, and that nothing else is using that port. Open EFB cannot connect to remote computers; the WebSocket Server must be on the same PC.

**Telemetry unavailable.** See above. "Connected, waiting for the simulator" usually means the flight has not loaded yet. "Data is stale" means the connection stalled; Open EFB reopens it by itself.

**A tablet cannot reach the PC.**
1. Same Wi-Fi? Some guest networks block devices from seeing each other.
2. Is **Allow tablets on my network** on?
3. Type the address exactly, including `http://` and `:4780`. Try the other addresses listed.
4. Windows Firewall: when asked, allow Open EFB on **private networks** only. If you refused, open **Windows Security > Firewall & network protection > Allow an app through firewall** and tick **Private** for Open EFB. This opens the port only for Open EFB, only on private networks. Avoid opening ports for "Public" networks.
5. A VPN on the PC or tablet can also get in the way.

**Port conflict.** If another program uses 4780, Open EFB shows "Open EFB could not start" and exits. Find the other program with `netstat -ano | findstr :4780`, and close it. A port setting exists but is not shown in the interface yet.

**Duplicate Open EFB processes.** Only one copy can run, and a second launch just shows the first. Task Manager shows several "Open EFB" lines because Electron uses a few processes; that is normal. If the app seems stuck, end all Open EFB processes in Task Manager and start it again.

**Upgrade or uninstall problems.** Close Open EFB (tray > Quit) first, then rerun the installer or uninstall. If a file is locked, end Open EFB in Task Manager.

---

## G. Updating and uninstalling

**Update.** Download the newer installer and run it over the existing installation (same account). Settings, paired tablets and logs are kept because they live in `%APPDATA%\Open EFB`, not in the install folder. Tablets stay paired. New settings (such as the simulator ones) take sensible defaults when an older settings record is loaded. **[Unverified on Windows]**

**Uninstall.** Settings > Apps > Open EFB > Uninstall. A question asks whether to delete your settings, paired tablets and logs as well. The default is **No**, which keeps them for a later reinstall. Upgrades do not show this question.

**Complete reset.** Quit Open EFB, uninstall and answer **Yes**. Or delete the folder `%APPDATA%\Open EFB` yourself. The next start begins with defaults and no paired tablets. The "start with Windows" entry is removed when you switch it off in settings before uninstalling. **[Unverified]** whether uninstalling removes it by itself, so check Task Manager > Startup apps.

---

## H. Developer and release instructions

### Tools
- Node.js 22.13 or newer (`engines`; `.nvmrc` says 22)
- pnpm 10 (`corepack enable`; `packageManager` is `pnpm@10.34.7`)
- Windows 10/11 to build the installer (the code itself builds on any OS)

### Build from a clean checkout
```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build          # web, server, desktop bundles
pnpm package:win    # Windows only
```
The installer is written to `apps/desktop/release/Open-EFB-Setup-<version>.exe`.

### Environment variables
| Variable | Used for | Notes |
|---|---|---|
| `VITE_CARTO_API_KEY` | CARTO basemap key for CabinView's map | Optional. **Anything set at build time is baked into the web bundle and the installer, so it is readable by users.** Leave it unset for public releases unless the key is meant to be public. Example: `VITE_CARTO_API_KEY=YOUR_KEY_HERE` |
| `OPEN_EFB_SIM=mock` | Development only: simulated telemetry, always labelled as simulated | Never set for releases. |
| `OPEN_EFB_DATA` | Data folder for the headless server (`pnpm dev`) | Example: `OPEN_EFB_DATA=./data` |

Do not commit `.env` files (they are git-ignored) or put real keys in docs.

### Test the installer locally (on a Windows PC or VM)
1. Build as above and run the installer. Complete the [manual test checklist](#manual-test-checklist).
2. To test an upgrade, install an older build, change a setting and pair a tablet, then install the newer build over it and check both are kept.

### Publish a release
1. Set the same new version in `apps/desktop/package.json` and the root `package.json`.
2. Commit, then tag and push:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. The **Release** workflow (`.github/workflows/release.yml`) checks that the tag matches the app version, runs typecheck, tests and build, builds the installer on Windows, and creates a **draft** GitHub release with the installer and `SHA256SUMS.txt`. **[Unverified]** The workflow has not been run yet.
4. Check the draft, install it on a clean PC, then publish it.

### If packaging fails
- Delete `apps/desktop/dist`, `apps/desktop/release` and run `pnpm build` again.
- Build the web app first (`pnpm build:web`); the installer copies `apps/web/dist`.
- `electron-builder` downloads Electron and NSIS on first use; a blocked network breaks this.
- Check the packed app size. `apps/desktop/package.json` lists workspace packages and `qrcode` as dependencies, and the bundle already contains them. If the installer is much larger than expected, review whether `node_modules` was copied in. **[Unverified]**
- Always start the packed app once and check that the log file is written.

---

## Manual test checklist

Needs a Windows 10/11 PC; the simulator rows need MSFS 2020 or 2024, and live data rows need FSUIPC7 plus the WebSocket Server.

**Installer**
- [ ] Installs without an admin prompt. Start Menu shortcut exists; no desktop shortcut.
- [ ] App starts, tray icon appears, window shows "Server online".
- [ ] Install over the same version and over an older one: settings and paired tablet survive.
- [ ] Uninstall asks about data; **No** keeps `%APPDATA%\Open EFB`, **Yes** removes it.
- [ ] Upgrade does not show the data question.

**Auto launch**
- [ ] Tray shows "Waiting for MSFS to start" with no simulator.
- [ ] Start MSFS 2020: within about 15 s tray shows "MSFS 2020 detected" and the window opens without taking focus from the sim. Same for MSFS 2024.
- [ ] Close the EFB window, then keep flying: it does not reopen.
- [ ] Close MSFS: tray returns to "Waiting" after about 30 s. Start MSFS again: window opens again.
- [ ] Start MSFS first, then Open EFB: window opens.
- [ ] Turn off "Open the EFB when MSFS starts": starting MSFS does nothing.
- [ ] Start Open EFB with Windows on: after sign-in it sits in the tray with no window; MSFS start opens the window. Turned off: the Startup entry is gone.
- [ ] Starting Open EFB twice shows only one instance.

**Flight data**
- [ ] Without FSUIPC: dashboard says "Simulator not connected" and fields show dashes.
- [ ] Start FSUIPC7 and its WebSocket Server (either order): status becomes "Simulator connected" and numbers move.
- [ ] Restart MSFS or the WebSocket Server: it reconnects without restarting Open EFB.

**Existing features**
- [ ] Tablet pairing over Wi-Fi: lock screen, code, dashboard; wrong code shows an error; disconnect works.
- [ ] CabinView opens, map tiles load, ATC page opens VATSIM Listen in the embedded browser.
- [ ] Chart cards open ChartFox and Navigraph in a new tab.
- [ ] Port 4780 in use: error box, clean exit.

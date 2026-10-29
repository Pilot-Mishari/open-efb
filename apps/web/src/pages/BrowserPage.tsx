import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { needsPlayerWindow } from "../lib/browser";

function normalizeTarget(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  return raw;
}

/**
 * The player window keeps this name so a station change re-navigates the window the user already
 * opened instead of spawning another one, and so a later tap reuses the same window after a reload.
 */
const PLAYER_WINDOW = "open-efb-vatsim-listen";

// Module scope: the window outlives this screen's renders while it is mounted. A full page reload
// forgets it, which only costs the user one more tap on "Open player window".
let playerWindow: Window | null = null;
let playerUrl: string | null = null;
let closeTimer: number | undefined;

const playerAlive = (): boolean => playerWindow !== null && !playerWindow.closed;
const closePlayer = (): void => {
  playerWindow?.close();
  playerWindow = null;
  playerUrl = null;
};

export function BrowserPage() {
  const [params] = useSearchParams();
  const target = useMemo(() => normalizeTarget(params.get("url")), [params]);
  const returnTo = useMemo(() => normalizeReturnTo(params.get("returnTo")), [params]);
  const standalone = target !== null && needsPlayerWindow(target);
  const [playerOpen, setPlayerOpen] = useState<boolean>(() => playerAlive());
  const [blocked, setBlocked] = useState(false);

  // This screen owns the player window: leaving it closes playback, which is what unloading the
  // iframe used to do, so nothing keeps playing for a frequency the aircraft is no longer on.
  useEffect(() => {
    window.clearTimeout(closeTimer);
    return () => {
      // Deferred by a tick so React StrictMode's mount -> cleanup -> mount cycle in development
      // does not close a window that was just handed to the user.
      closeTimer = window.setTimeout(closePlayer, 0);
    };
  }, []);

  // Retuning changes ?url=; the already-open window follows it rather than reloading unchanged.
  useEffect(() => {
    if (!standalone || !target) return;
    const w = playerWindow;
    if (!w || w.closed || playerUrl === target) return;
    w.location.href = target;
    playerUrl = target;
    setPlayerOpen(true);
  }, [standalone, target]);

  // Notice when the user closes the window themselves.
  useEffect(() => {
    const id = window.setInterval(() => setPlayerOpen(playerAlive()), 2000);
    return () => window.clearInterval(id);
  }, []);

  const openPlayer = () => {
    if (!target) return;
    const opened = window.open(target, PLAYER_WINDOW);
    // A proxy that is already closed means the window never really opened (pop-up blocked, or an
    // embedded webview that redirects window.open elsewhere): fall back to a plain link rather
    // than claiming success.
    if (!opened || opened.closed) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    playerWindow = opened;
    playerUrl = target;
    setPlayerOpen(true);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {returnTo ? (
            <Link to={returnTo} className="rounded-lg border border-line bg-panel px-4 py-2.5 text-lg">Back to CabinView</Link>
          ) : (
            <Link to="/home" className="rounded-lg border border-line bg-panel px-4 py-2.5 text-lg">Back to dashboard</Link>
          )}
          <div className="text-sm text-muted">Embedded browser</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {target && !standalone && (
            <a href={target} target="_blank" rel="noreferrer noopener"
              className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-text hover:bg-panel-hi">
              Open in browser
            </a>
          )}
          <div className="max-w-xl truncate rounded-lg border border-line bg-panel px-3 py-2 text-sm text-muted">
            {target ? new URL(target).hostname : "No page selected"}
          </div>
        </div>
      </div>

      {!target ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-line bg-panel p-12 text-center text-lg text-muted">
          <div>
            <p className="text-2xl font-semibold text-text">No page was selected</p>
            <p className="mt-2">Open a chart or OFP from inside the EFB to load it here.</p>
          </div>
        </div>
      ) : standalone ? (
        <section aria-label="VATSIM Listen player" className="grid flex-1 place-items-center rounded-2xl border border-line bg-panel p-10 text-center">
          <div className="max-w-2xl">
            <p className="num text-sm uppercase tracking-[0.28em] text-muted">VATSIM Listen</p>
            <h2 className="mt-3 font-instrument text-4xl font-semibold">
              {playerOpen ? "The player window is open" : "Open the player window"}
            </h2>
            <p className="mt-4 text-lg text-muted">
              VATSIM’s sign-in page cannot be embedded in any browser frame — it refuses
              that on purpose — so this player runs in its own window. Sign in with your VATSIM
              account the first time: the window remembers you, opens straight into the tuned station
              afterwards, and the EFB keeps it pointed at whatever the radios are tuned to.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={openPlayer}
                className="rounded-lg bg-teal px-6 py-3 text-lg font-semibold text-on-teal hover:bg-teal-deep"
              >
                {playerOpen ? "Reopen player window" : "Open player window"}
              </button>
              {playerOpen && <span role="status" className="text-base text-teal">Following the tuned station</span>}
            </div>
            {blocked && (
              <p role="alert" className="mt-4 text-alert">
                The window could not be opened here. Allow pop-ups for this address and press the
                button again, or{" "}
                <a href={target} target="_blank" rel="noreferrer noopener" className="underline">
                  open the player in a new tab
                </a>{" "}
                directly — sign in once there and VATSIM will remember you.
              </p>
            )}
            <p className="num mt-6 text-sm text-muted">{new URL(target).pathname.replace(/^\//, "") || target}</p>
          </div>
        </section>
      ) : (
        <iframe
          key={target}
          title="In-app browser"
          src={target}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
          referrerPolicy="no-referrer-when-downgrade"
          className="min-h-[72vh] w-full flex-1 rounded-2xl border border-line bg-black"
        />
      )}
    </div>
  );
}

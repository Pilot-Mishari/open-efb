import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { AirportInfo, FlightPlan } from "@open-efb/shared";
import { Icon } from "../lib/icons";
import { describeError } from "../lib/api";
import { utcTime } from "../lib/format";

const JUST_PAIRED = "efb:just-paired";
export const wasJustPaired = (): boolean => {
  try { return sessionStorage.getItem(JUST_PAIRED) === "1"; } catch { return false; }
};
export const setJustPaired = (on: boolean): void => {
  try { if (on) sessionStorage.setItem(JUST_PAIRED, "1"); else sessionStorage.removeItem(JUST_PAIRED); } catch { /* storage unavailable */ }
};

const HOUR = 3_600_000;
const hhmm = (ms: number, offsetH: number) => new Date(ms + offsetH * HOUR).toISOString().slice(11, 16);
const offsetOf = (a?: AirportInfo | null) => a?.timezone ?? (a?.lon == null ? null : Math.round(a.lon / 15));
const code = (a?: AirportInfo | null) => a?.iata ?? a?.icao ?? null;

const LETTERS = ["ABC", "DEF", "GHI", "JKL", "MNO", "PQRS", "TUV", "WXYZ"];
const BG = {
  backgroundImage: "linear-gradient(to bottom, rgb(13 28 66 / 0.55), rgb(13 28 66 / 0.85)), url(/launch.png), radial-gradient(ellipse at 50% 30%, var(--efb-panel-hi), var(--efb-ink) 75%)",
  backgroundSize: "cover",
  backgroundPosition: "center",
} as const;
const PASSCODE_BG = {
  backgroundImage: "linear-gradient(to bottom, rgb(13 28 66 / 0.6), rgb(13 28 66 / 0.9)), url(/passcode.png), radial-gradient(ellipse at 50% 30%, var(--efb-panel-hi), var(--efb-ink) 75%)",
  backgroundSize: "cover",
  backgroundPosition: "center",
} as const;
const EASE = "transform 450ms cubic-bezier(0.22, 0.8, 0.2, 1), opacity 450ms ease";

function Key({ digit, onPress }: { digit: string; onPress: (d: string) => void }) {
  return (
    <button type="button" onClick={() => onPress(digit)} aria-label={digit}
      className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-text/15 backdrop-blur transition-colors active:bg-text/40">
      <span className="font-instrument text-4xl font-light leading-none">{digit}</span>
      <span className="num mt-1 h-3 text-[0.65rem] tracking-[0.2em] text-muted">{/^[2-9]$/.test(digit) ? LETTERS[Number(digit) - 2] : ""}</span>
    </button>
  );
}

function Row({ label, value, dim = false }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between border-b border-line/60 py-3 last:border-0 ${dim ? "text-muted" : ""}`}>
      <span className="text-lg">{label}</span>
      <span className="num text-xl">{value}</span>
    </div>
  );
}

export interface LockScreenProps {
  plan: FlightPlan | null;
  pill: readonly [string, string];
  alert: readonly [string, string] | null;
  /** Used when no code is needed: swiping up simply leaves the lock screen. */
  onUnlock?: () => void;
  /** When set, swiping up shows the keypad and this is called with the 4 digits. Throw to show an error. */
  onPin?: (pin: string) => Promise<void>;
}

export function LockScreen({ plan, pill, alert, onUnlock, onPin }: LockScreenProps) {
  const [now, setNow] = useState(() => Date.now());
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [help, setHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const start = useRef({ y: 0, t: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(t); window.clearTimeout(timer.current); };
  }, []);

  const openLock = () => {
    if (open) return;
    setOpen(true);
    if (!onPin) timer.current = window.setTimeout(() => onUnlock?.(), 380);
  };
  const cancel = () => { setOpen(false); setPin(""); setHelp(false); setError(null); };
  const press = (d: string) => {
    if (busy) return;
    setError(null);
    setPin((p) => (p.length < 4 ? p + d : p));
  };
  const erase = () => { setError(null); setPin((p) => p.slice(0, -1)); };

  useEffect(() => {
    if (pin.length !== 4 || !onPin) return;
    setBusy(true);
    onPin(pin)
      .catch((e: unknown) => { setError(describeError(e)); setPin(""); })
      .finally(() => setBusy(false));
  }, [pin]);

  useEffect(() => {
    if (!open || !onPin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return help ? setHelp(false) : cancel();
      if (help) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") erase();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, help, busy]);

  const height = () => rootRef.current?.clientHeight ?? window.innerHeight;
  const onDown = (e: PointerEvent) => {
    if (open || (e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, t: performance.now() };
    setDragging(true);
  };
  const onMove = (e: PointerEvent) => {
    if (dragging) setDrag(Math.min(height(), Math.max(0, start.current.y - e.clientY)));
  };
  const onUp = () => {
    if (!dragging) return;
    const speed = drag / Math.max(1, performance.now() - start.current.t);
    setDragging(false);
    if (drag > height() * 0.25 || (drag > 40 && speed > 0.6)) openLock();
    setDrag(0);
  };
  const progress = open ? 1 : Math.min(1, drag / (height() * 0.6));
  const transition = dragging ? "none" : EASE;

  const originOffset = offsetOf(plan?.origin);
  const destOffset = offsetOf(plan?.destination);
  const deviceOffset = -new Date(now).getTimezoneOffset() / 60;
  const bigOffset = originOffset ?? deviceOffset;
  const bigLabel = plan && originOffset !== null ? code(plan.origin) : "LOCAL";
  const dateText = new Date(now + bigOffset * HOUR)
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .replace(",", "")
    .toUpperCase();
  const [pillText, pillDot] = pill;
  const pushback = plan ? utcTime(plan.times.scheduledOut ?? plan.times.estimatedOut) : "—";
  const arrival = plan ? utcTime(plan.times.estimatedIn) : "—";

  return (
    <div ref={rootRef} className="relative h-full overflow-hidden bg-ink">
      {onPin && (
        <div
          className="absolute inset-0 z-0 flex flex-col items-center justify-between px-8 pb-12 pt-24 text-center"
          style={{ ...PASSCODE_BG, opacity: progress, transform: `scale(${0.94 + 0.06 * progress})`, transition }}
          aria-hidden={!open} inert={!open}
        >
          <div>
            <div className="font-instrument text-3xl font-medium">Enter Passcode</div>
            <div className="mt-8 flex justify-center gap-5" role="status" aria-label={`${pin.length} of 4 digits entered`}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-4 w-4 rounded-full border-2 transition-colors ${error ? "border-alert" : "border-text"} ${i < pin.length ? (error ? "bg-alert" : "bg-text") : ""}`} />
              ))}
            </div>
            <p role="alert" className="mx-auto mt-5 min-h-16 max-w-sm text-lg text-alert">{error}</p>
          </div>
          <div className="grid grid-cols-3 gap-x-7 gap-y-5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <Key key={d} digit={d} onPress={press} />)}
            <span />
            <Key digit="0" onPress={press} />
            <span />
            <button type="button" onClick={() => setHelp(true)} className="self-center text-lg hover:text-muted">Forgot Passcode?</button>
            <span />
            <button type="button" onClick={pin ? erase : cancel} className="self-center text-lg hover:text-muted">{pin ? "Delete" : "Cancel"}</button>
          </div>
          {help && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-black/50 px-8" role="dialog" aria-modal="true" aria-labelledby="help-title">
              <div className="w-96 max-w-full overflow-hidden rounded-3xl bg-panel text-center shadow-2xl">
                <div className="p-6">
                  <div id="help-title" className="font-instrument text-2xl font-semibold">Forgot Passcode?</div>
                  <p className="mt-3 text-lg text-muted">
                    The passcode is the 4-digit pairing code shown on your PC. Right-click the Open EFB tray icon, choose &ldquo;Connect a tablet&hellip;&rdquo; and enter the code you see there. It changes every 5 minutes.
                  </p>
                </div>
                <button type="button" autoFocus onClick={() => setHelp(false)} className="w-full border-t border-line py-4 text-lg font-medium hover:bg-panel-hi">OK</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div
        className="absolute inset-0 z-10 flex touch-none select-none flex-col justify-between overflow-hidden px-12 py-10"
        style={{ ...BG, transform: `translate3d(0, ${open ? "-100%" : `${-drag}px`}, 0)`, transition, pointerEvents: open ? "none" : "auto" }}
        aria-hidden={open} inert={open}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      >
        <header className="flex items-center justify-between">
          <div className="num text-lg uppercase tracking-[0.25em]">{plan?.aircraft.icao ?? "EFB"} &middot; Open EFB</div>
          <div className="flex items-center gap-2 rounded-full border border-line bg-panel/70 px-4 py-1.5 text-base" role="status">
            <span className={`h-2.5 w-2.5 rounded-full ${pillDot}`} />{pillText}
          </div>
        </header>

        {alert && (
          <div className="absolute left-1/2 top-28 flex w-[34rem] max-w-[calc(100%-6rem)] -translate-x-1/2 items-start gap-4 rounded-3xl border border-line/60 bg-panel/90 p-4 shadow-2xl backdrop-blur" role="status">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber/20 text-amber"><Icon name="briefing" className="h-6 w-6" /></span>
            <div>
              <div className="text-sm text-muted">Open EFB</div>
              <div className="num text-xl font-semibold uppercase">{alert[0]}</div>
              <div className="text-muted">{alert[1]}</div>
            </div>
          </div>
        )}

        <div className="flex items-end justify-between gap-8">
          <div>
            <div className="num text-lg uppercase tracking-[0.25em] text-muted">{dateText}</div>
            <div className="num font-instrument text-[11rem] font-extralight leading-none tracking-tight xl:text-[14rem]" aria-label={`${bigLabel} time ${hhmm(now, bigOffset)}`}>
              {hhmm(now, bigOffset)}
            </div>
            <div className="num mt-2 flex gap-6 text-xl">
              <span>UTC {hhmm(now, 0)}</span>
              {plan && destOffset !== null && <span>{code(plan.destination)} {hhmm(now, destOffset)}</span>}
              {plan && originOffset !== null && <span className="text-muted">{bigLabel}</span>}
            </div>
          </div>

          <section className="w-96 shrink-0 rounded-3xl border border-line/60 bg-panel/90 p-6 backdrop-blur" aria-label="Next up">
            <h2 className="num mb-2 text-sm uppercase tracking-[0.25em] text-muted">Next up</h2>
            <Row label="Pushback" value={pushback} />
            <Row label="Runway" value={plan?.origin.runway ?? "—"} dim />
            <Row label="Arrival" value={arrival} dim />
          </section>
        </div>

        <footer className="flex items-center justify-between border-t border-line/60 pt-5">
          <div className="num flex items-center gap-4 text-xl">
            <span>{plan?.callsign ?? plan?.flightNumber ?? "NO CALLSIGN"}</span>
            <span className="text-muted">&middot;</span>
            <span>{plan ? `${plan.origin.icao} → ${plan.destination.icao}` : "———— → ————"}</span>
            {plan?.aircraft.registration && <><span className="text-muted">&middot;</span><span className="text-muted">{plan.aircraft.registration}</span></>}
          </div>
          <button type="button" onClick={openLock} className="num rounded-full px-5 py-2 text-base uppercase tracking-[0.25em] text-muted hover:text-text">
            Swipe up to unlock
          </button>
        </footer>
        <span className="pointer-events-none absolute bottom-2 left-1/2 h-1.5 w-40 -translate-x-1/2 rounded-full bg-text/60" aria-hidden="true" />
      </div>
    </div>
  );
}
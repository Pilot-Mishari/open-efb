import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AirportInfo, FlightBoardResponse } from "@open-efb/shared";
import { SeatBadge } from "../components/SeatBadge";
import { SplitFlap } from "../components/SplitFlap";
import { api, describeError } from "../lib/api";
import { usePlan } from "../lib/plan-context";
import { airportClock } from "../lib/flight-info";
import { ago } from "../lib/format";
import { boardRows, boardStatus, boardTimeLabel, boardTimeUtc, type BoardView } from "../lib/flightboard";

/**
 * Full-screen split board: departures at the departure airport on the left, arrivals at the
 * arrival airport on the right, both taken from the active flight plan. Rows are VATSIM network
 * traffic (flights filed on VATSIM whose plan names the airport), never real-world airline
 * schedules — with no plan the screen says so, with no traffic it says so, and it never shows a
 * flight, time or status the feed did not report. The mini flight widget stays on top
 * (CabinLayout) and both boards reserve bottom space for it.
 */

const REFRESH_MS = 60_000;
const TICK_MS = 30_000;
const DASH = "\u2014";

/** Column layout shared by the header row and every flight row (also mirrors in RTL). */
const COLS =
  "grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_4.6rem_minmax(0,1.1fr)] items-center gap-1.5 sm:gap-2";

interface BoardState {
  phase: "idle" | "loading" | "ready" | "error";
  data: FlightBoardResponse | null;
  error: string | null;
  /** ms epoch of the last completed attempt. */
  attemptedAt: number;
}

/** Loads one airport's board, then refreshes every minute while the screen is open. */
function useAirportBoard(code: string | null, nonce: number): BoardState {
  const [state, setState] = useState<BoardState>({ phase: "idle", data: null, error: null, attemptedAt: 0 });

  useEffect(() => {
    if (!code) {
      setState({ phase: "idle", data: null, error: null, attemptedAt: 0 });
      return;
    }
    let cancelled = false;
    const load = async () => {
      // Data already on screen stays visible through a refresh; only the first load shows a spinner.
      setState((s) => ({ ...s, phase: s.data ? s.phase : "loading" }));
      try {
        const data = await api.flightBoard(code);
        if (!cancelled) setState({ phase: "ready", data, error: null, attemptedAt: Date.now() });
      } catch (e) {
        if (!cancelled) setState((s) => ({ phase: "error", data: s.data, error: describeError(e), attemptedAt: Date.now() }));
      }
    };
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [code, nonce]);

  return state;
}

function Tabs({ view, onChange }: { view: BoardView; onChange: (v: BoardView) => void }) {
  return (
    <div role="tablist" aria-label="Board direction" className="flex shrink-0 gap-1 rounded-full border border-line/60 bg-ink/60 p-1">
      {(["departures", "arrivals"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={view === v}
          onClick={() => onChange(v)}
          className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${
            view === v ? "bg-amber text-[#0d1c42]" : "text-muted hover:text-text"
          }`}
        >
          {v === "departures" ? "Departures" : "Arrivals"}
        </button>
      ))}
    </div>
  );
}

/** Skeleton rows: flap-shaped placeholders, no invented flight data. */
function BoardSkeleton() {
  return (
    <div className="space-y-2 pt-2" aria-hidden="true">
      {[64, 80, 72, 88, 68, 76].map((w, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="sf-cell num text-text" style={{ width: `${w * 0.55}px` }}>&nbsp;</span>
          <span className="sf-cell num" style={{ width: "34px" }}>&nbsp;</span>
          <span className="sf-cell num ms-auto" style={{ width: "44px" }}>&nbsp;</span>
        </div>
      ))}
    </div>
  );
}

function PanelNotice({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-xl border border-line/60 bg-ink/70 px-3.5 py-2.5 text-sm leading-relaxed text-muted">{children}</p>
  );
}

function BoardPanel({
  airport,
  side,
  state,
  now,
  onRetry,
}: {
  airport: AirportInfo;
  side: "departure" | "arrival";
  state: BoardState;
  now: number;
  onRetry: () => void;
}) {
  const [view, setView] = useState<BoardView>(side === "departure" ? "departures" : "arrivals");
  const code = airport.icao ?? airport.iata ?? DASH;
  // Full name from the flight plan; VATSIM has no airport database, so no name is ever invented.
  const name = airport.name ?? code;
  const clock = airportClock(airport, new Date(now));

  const flights = state.data ? (view === "departures" ? state.data.departures : state.data.arrivals) : [];
  const rows = boardRows(flights, view);

  return (
    <section
      aria-label={`${side === "departure" ? "Departure" : "Arrival"} airport board`}
      className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-line bg-panel"
    >
      <header className="border-b border-line/60 bg-panel-hi/40 px-5 pb-3.5 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber">
              {side === "departure" ? "Departure airport" : "Arrival airport"}
            </div>
            <h2 className="mt-0.5 truncate font-instrument text-2xl font-semibold leading-tight sm:text-3xl" title={name}>
              {name}
            </h2>
            <div className="num mt-1 flex items-baseline gap-3 text-sm text-muted" dir="ltr">
              <span className="tracking-[0.2em]">{code}</span>
              <span aria-hidden="true">·</span>
              <span>Local {clock ?? DASH}</span>
            </div>
          </div>
          <Tabs view={view} onChange={setView} />
        </div>
      </header>

      {state.phase === "error" && !state.data && (
        <div className="px-5 pt-4">
          <PanelNotice>
            {state.error ?? "Live flight data is unavailable right now."}
            <button type="button" onClick={onRetry} className="ms-3 rounded-lg border border-line px-3 py-1 text-xs uppercase tracking-[0.15em] text-text hover:bg-panel-hi">
              Retry
            </button>
          </PanelNotice>
        </div>
      )}
      {state.phase === "error" && state.data && (
        <div className="px-5 pt-4">
          <PanelNotice>
            Connection lost — showing data from {ago(state.attemptedAt, now)}.
            <button type="button" onClick={onRetry} className="ms-3 rounded-lg border border-line px-3 py-1 text-xs uppercase tracking-[0.15em] text-text hover:bg-panel-hi">
              Retry
            </button>
          </PanelNotice>
        </div>
      )}
      {!state.data && state.phase === "loading" && (
        <div className="px-5 py-4">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted">Loading VATSIM traffic…</p>
          <BoardSkeleton />
        </div>
      )}

      {state.data && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={`${COLS} px-5 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber`}>
            <span>Flight</span>
            <span>{view === "departures" ? "To" : "From"}</span>
            <span className="text-end" dir="ltr">{view === "departures" ? "Filed" : "Est"}</span>
            <span>Status</span>
          </div>
          <ol className="min-h-0 flex-1 divide-y divide-line/30 overflow-y-auto px-5 pb-36 lg:pb-44">
            {rows.map((f) => {
              const st = boardStatus(f, view);
              // Departures show the filed off-block time, arrivals the plan's estimated arrival —
              // both converted to this airport's local zone (UTC with a Z if no zone is known).
              const time = boardTimeLabel(boardTimeUtc(f, view), airport);
              return (
                <li key={f.id} className={`${COLS} py-2`}>
                  <SplitFlap value={f.flight} className="min-w-0 text-text" />
                  <SplitFlap value={f.otherAirport ?? DASH} className="min-w-0 text-muted" />
                  <SplitFlap value={time} className="min-w-0 justify-end text-text" />
                  <span
                    className={`truncate text-[11px] font-semibold uppercase tracking-[0.14em] sm:text-xs ${
                      st.tone === "warn" ? "text-amber" : st.tone === "alert" ? "text-alert" : "text-text"
                    }`}
                    dir="ltr"
                  >
                    {st.label}
                  </span>
                </li>
              );
            })}
            {rows.length === 0 && (
              <li className="py-6 text-sm text-muted">
                {state.phase === "loading"
                  ? "Loading VATSIM traffic…"
                  : `No VATSIM flights filed for ${code} right now — the network has no ${view} there.`}
              </li>
            )}
          </ol>
        </div>
      )}
    </section>
  );
}

export function CabinFlightBoardPage() {
  const { plan, status: planStatus, error: planError } = usePlan();
  const [now, setNow] = useState(() => Date.now());
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const origin = plan?.origin ?? null;
  const destination = plan?.destination ?? null;
  const originCode = origin?.icao ?? origin?.iata ?? null;
  const destCode = destination?.icao ?? destination?.iata ?? null;

  const departureBoard = useAirportBoard(originCode, nonce);
  const arrivalBoard = useAirportBoard(destCode, nonce);

  const updatedAt = Math.max(departureBoard.data?.fetchedAt ?? 0, arrivalBoard.data?.fetchedAt ?? 0);
  const retry = () => {
    setNow(Date.now());
    setNonce((n) => n + 1);
  };

  const noPlanMessage = useMemo(() => {
    if (planStatus === "loading") return "Loading your flight plan…";
    if (planStatus === "error") return planError ?? "The flight plan could not be loaded.";
    return "Load a SimBrief flight plan and this board will show the VATSIM traffic filed for both of its airports.";
  }, [planStatus, planError]);

  if (!origin || !destination || !originCode || !destCode) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center gap-4 overflow-y-auto p-8 text-center">
        <SeatBadge />
        <h1 className="font-instrument text-4xl font-semibold">Airport Flight Board</h1>
        <p className="max-w-md text-lg text-muted">{noPlanMessage}</p>
        <Link to="/cabin/home" className="mt-2 rounded-lg bg-teal px-6 py-3 text-lg font-medium text-on-teal hover:bg-teal-deep">
          Back to CabinView home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-line/60 px-5 py-3.5 pr-44">
        <div className="min-w-0">
          <h1 className="font-instrument text-xl font-semibold leading-tight sm:text-2xl">Airport Flight Board</h1>
          <p className="text-[10px] uppercase tracking-[0.28em] text-muted">VATSIM departures &amp; arrivals</p>
        </div>
        <div className="num text-xs text-muted" dir="ltr">
          {updatedAt > 0 ? <>Updated {ago(updatedAt, now)}</> : "Not updated yet"}
        </div>
        <div className="ms-auto flex items-center gap-3">
          <button
            type="button"
            onClick={retry}
            className="rounded-lg border border-line px-4 py-2 text-sm uppercase tracking-[0.15em] hover:bg-panel"
          >
            Refresh
          </button>
          <Link to="/cabin/home" className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-panel">
            Back
          </Link>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 pb-6 lg:grid-cols-2 lg:overflow-hidden">
        <BoardPanel airport={origin} side="departure" state={departureBoard} now={now} onRetry={retry} />
        <BoardPanel airport={destination} side="arrival" state={arrivalBoard} now={now} onRetry={retry} />
      </main>
    </div>
  );
}

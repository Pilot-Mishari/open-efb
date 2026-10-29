import { useNavigate } from "react-router-dom";
import { SeatBadge } from "../components/SeatBadge";
import type { ListenDecision } from "@open-efb/shared";
import { useCabinRadio } from "../lib/cabin-radio-context";

/** One read-only radio line; frequencies come from the simulator, never from the user. */
function Radio({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line/60 py-3 last:border-0">
      <span className="text-lg text-muted">{label}</span>
      <span className={`num text-2xl ${value ? "text-teal" : "text-muted"}`}>{value ?? "—"}</span>
    </div>
  );
}

type Card = { title: string; body: string; tone: "wait" | "info" | "warn"; extra?: string[] };

function describe(decision: ListenDecision | null, busy: boolean, simLabel: string, simDetail: string | null): Card {
  if (!decision) {
    return { title: busy ? "Checking VATSIM" : "One moment", body: "Reading the tuned frequencies and looking for an online controller.", tone: "wait" };
  }
  switch (decision.status) {
    case "ok":
      return {
        title: `Opening ${decision.station}`,
        body: `${decision.controller ?? decision.position ?? "Controller"} on ${decision.frequency} (${decision.radio}). The player screen opens by itself — tap “Open player” once (VATSIM's sign-in cannot be embedded) and the window follows the radios from then on.`,
        tone: "info",
      };
    case "no_frequency":
      return {
        title: "No radio tuning available",
        body: simDetail ?? simLabel,
        tone: "wait",
      };
    case "offline":
      return {
        title: `${decision.frequency} — nobody is online`,
        body: "No VATSIM controller is listening on that frequency right now, so nothing is opened.",
        tone: "info",
      };
    case "ambiguous":
      return {
        title: `${decision.frequency} — more than one station`,
        body: "Several controllers share this frequency, so Open EFB does not guess which one you mean. Nothing is opened.",
        tone: "warn",
        extra: decision.candidates,
      };
    case "unavailable":
      return {
        title: "VATSIM data unavailable",
        body: "The lookup failed, so nothing was opened or changed. Trying again automatically.",
        tone: "warn",
      };
  }
}

const TONE: Record<Card["tone"], string> = {
  wait: "border-line text-muted",
  info: "border-teal/50 text-text",
  warn: "border-amber/60 text-amber",
};

/**
 * Automatic ATC listening. There is no station or frequency input: this screen only reports what
 * the aircraft is tuned to and what VATSIM has online, and CabinLayout opens the embedded player on
 * its own as soon as exactly one station fits the tuned frequency.
 */
export function CabinATCPage() {
  const navigate = useNavigate();
  const { com1, com2, decision, busy, simLabel, simDetail } = useCabinRadio();
  const card = describe(decision, busy, simLabel, simDetail);

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-y-auto px-8 py-10">
      <SeatBadge />
      <div className="w-full max-w-3xl rounded-3xl border border-line bg-panel p-8 shadow-[0_0_0_1px_rgba(148,163,184,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-muted">CabinView</p>
            <h1 className="mt-2 font-instrument text-5xl font-semibold text-text">Listen to ATC</h1>
          </div>
          <button
            type="button"
            onClick={() => navigate("/cabin/home")}
            className="rounded-lg border border-line px-4 py-2 text-base text-muted hover:bg-panel-hi">
            Back home
          </button>
        </div>

        <p className="mt-6 max-w-2xl text-lg text-muted">
          Open EFB follows the aircraft&rsquo;s radios: whichever controller is online on the tuned
          frequency opens automatically in the VATSIM Listen player, and nothing else can be opened.
          The player lives in its own window, because the VATSIM sign-in page cannot be embedded:
          sign in there once and the window is remembered.
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <div className={`rounded-2xl border bg-ink p-5 ${TONE[card.tone]}`} role="status" aria-live="polite">
            <div className="font-instrument text-2xl font-semibold">{card.title}</div>
            <p className="mt-2 text-base text-muted">{card.body}</p>
            {card.extra && (
              <ul className="num mt-3 space-y-1 text-lg">
                {card.extra.map((c) => <li key={c}>{c}</li>)}
              </ul>
            )}
          </div>

          <section aria-label="Tuned radios" className="rounded-2xl border border-line bg-ink px-5 py-3">
            <h2 className="num mb-1 text-sm uppercase tracking-[0.25em] text-muted">Tuned</h2>
            <Radio label="COM1" value={com1} />
            <Radio label="COM2" value={com2} />
          </section>
        </div>

        <p className="mt-6 rounded-2xl border border-dashed border-line bg-ink p-4 text-sm text-muted">
          COM1 and COM2 are read from the simulator. MSFS does not report which radio is selected for
          receiving over FSUIPC, so when both radios have a controller online, COM1 (the primary
          radio) is the one followed. Standby frequencies are ignored until they are selected.
        </p>
      </div>
    </div>
  );
}

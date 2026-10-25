import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SeatBadge } from "../components/SeatBadge";
import { Icon } from "../lib/icons";
import { GREETINGS } from "../lib/cabin";

const HOLD_MS = 2200;
const FADE_MS = 220;

export function CabinPage() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let swap: number | undefined;
    const tick = window.setInterval(() => {
      setVisible(false);
      swap = window.setTimeout(() => {
        setIndex((i) => (i + 1) % GREETINGS.length);
        setVisible(true);
      }, FADE_MS);
    }, HOLD_MS + FADE_MS);
    return () => { window.clearInterval(tick); window.clearTimeout(swap); };
  }, []);

  const greeting = GREETINGS[index]!;

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-12 text-center"
      style={{ background: "radial-gradient(ellipse at 50% 40%, var(--efb-panel-hi) 0%, var(--efb-panel) 45%, var(--efb-ink) 100%)" }}>
      <Link to="/" className="absolute left-8 top-8 rounded-lg px-4 py-3 text-lg text-muted hover:text-text">Exit to EFB</Link>
      <SeatBadge />

      <Icon name="cabin" className="h-12 w-12 rotate-90 text-teal" />
      <div className="mt-8 flex h-32 w-full max-w-5xl items-center justify-center">
        <h1 lang={greeting.lang} dir={greeting.dir}
          className={`font-instrument text-7xl font-semibold leading-tight transition-opacity duration-500 ${visible ? "opacity-100" : "opacity-0"}`}>
          {greeting.text}
        </h1>
      </div>
      <div className="my-6 h-px w-40 bg-line" aria-hidden="true" />
      <p className="text-2xl uppercase tracking-[0.35em] text-muted">Start your journey</p>

      <Link to="/cabin/home"
        className="mt-14 rounded-full bg-teal px-12 py-5 font-instrument text-2xl font-semibold tracking-wide text-on-teal hover:bg-teal-deep">
        Enter CabinView
      </Link>
    </div>
  );
}
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../lib/icons";
import { describeError } from "../lib/api";
import { useAuth } from "../lib/auth-context";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

export function PairPage() {
  const { pair } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      await pair(value);
    } catch (e) {
      setError(describeError(e));
      setCode("");
    } finally {
      setBusy(false);
    }
  }, [pair]);

  const press = useCallback((key: string) => {
    if (busy) return;
    setError(null);
    if (key === "back") return setCode((c) => c.slice(0, -1));
    if (code.length >= 4) return;
    const next = code + key;
    setCode(next);
    if (next.length === 4) void submit(next);
  }, [busy, code, submit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal text-on-teal"><Icon name="cabin" className="h-8 w-8" /></span>
        <h1 className="mt-5 font-instrument text-4xl font-semibold">Connect to Open EFB</h1>
        <p className="mx-auto mt-2 max-w-xs text-lg text-muted">Enter the 4-digit code shown in the Open EFB app on your PC.</p>
        <div className="mt-6 flex justify-center gap-3" aria-live="polite" aria-label={`${code.length} of 4 digits entered`}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="num grid h-20 w-16 place-items-center rounded-xl border border-line bg-panel text-5xl font-semibold">{code[i] ? "\u2022" : ""}</div>
          ))}
        </div>
        <p role="alert" className="mt-4 min-h-14 text-lg text-alert">{error}</p>
        <div className="mx-auto grid max-w-xs grid-cols-3 gap-3">
          {KEYS.map((k, i) =>
            k === "" ? <span key={i} /> : (
              <button key={k} onClick={() => press(k)} disabled={busy} aria-label={k === "back" ? "Delete" : k}
                className="num min-h-16 rounded-xl border border-line bg-panel text-3xl font-medium active:bg-panel-hi disabled:opacity-50">{k === "back" ? "\u232b" : k}</button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
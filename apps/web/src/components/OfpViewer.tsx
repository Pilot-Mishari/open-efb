import { useCallback, useEffect, useState } from "react";
import type { OfpTextResponse } from "@open-efb/shared";
import { api, describeError } from "../lib/api";
import { utcDateTime } from "../lib/format";
import { usePlan } from "../lib/plan-context";
import { EmptyState, Panel } from "./Panel";

const SIZES = [11, 12, 13, 14, 16, 18, 20];

export function OfpViewer() {
  const { plan } = usePlan();
  const [data, setData] = useState<OfpTextResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState(2);
  const [wrap, setWrap] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.ofpText());
      setError(null);
    } catch (e) {
      setError(describeError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, plan?.fetchedAt]);

  if (!data) return <EmptyState title={error ? "Could not load the OFP" : "Loading the OFP"} hint={error ?? "Reading the text of your latest plan."} />;
  if (!data.text) return <EmptyState title="No OFP text in this plan" hint="SimBrief did not include the text version of your latest plan." />;

  const btn = "min-h-12 min-w-12 rounded-lg border border-line px-4 text-lg disabled:opacity-40";
  return (
    <Panel title="Operational flight plan" note={`Generated ${utcDateTime(data.generatedAt)}`}>
      <div className="mb-3 flex items-center gap-3">
        <button className={btn} disabled={size === 0} onClick={() => setSize(size - 1)} aria-label="Smaller text">A&minus;</button>
        <button className={btn} disabled={size === SIZES.length - 1} onClick={() => setSize(size + 1)} aria-label="Larger text">A+</button>
        <button className={btn} aria-pressed={wrap} onClick={() => setWrap(!wrap)}>{wrap ? "Wrap on" : "Wrap off"}</button>
        {data.stale && <span className="text-sm text-amber">SimBrief unreachable, showing the last copy</span>}
      </div>
      <pre className={`max-h-[calc(100vh-20rem)] overflow-auto rounded-lg bg-ink p-4 font-mono leading-snug ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`} style={{ fontSize: SIZES[size] }}>{data.text}</pre>
    </Panel>
  );
}
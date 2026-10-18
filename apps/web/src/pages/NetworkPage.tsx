import { useCallback, useEffect, useRef, useState } from "react";
import type { VatsimAirport } from "@open-efb/shared";
import { EmptyState, Panel } from "../components/Panel";
import { ApiError, api, describeError } from "../lib/api";
import { ago, utcTime } from "../lib/format";
import { usePlan } from "../lib/plan-context";

const POLL_MS = 30_000;

export function NetworkPage() {
  const { plan } = usePlan();
  const [input, setInput] = useState("");
  const [icao, setIcao] = useState<string | null>(null);
  const [data, setData] = useState<VatsimAirport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [, tick] = useState(0);
  const seq = useRef(0);

  const load = useCallback(async (code: string) => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const r = await api.vatsimAirport(code);
      if (id === seq.current) {
        setData(r);
        setError(null);
      }
    } catch (e) {
      if (id === seq.current) setError(describeError(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  // Refresh automatically while an airport is selected; the server caches, so this is cheap.
  useEffect(() => {
    if (!icao) return;
    setData(null);
    void load(icao);
    const poll = window.setInterval(() => void load(icao), POLL_MS);
    const clock = window.setInterval(() => tick((n) => n + 1), 5000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
      seq.current++;
    };
  }, [icao, load]);

  const pick = (code: string) => {
    const c = code.trim().toUpperCase();
    setInput(c);
    if (/^[A-Z0-9]{3,4}$/.test(c)) setIcao(c);
    else setError(describeError(new ApiError("invalid_icao")));
  };
  const planAirports = [["Departure", plan?.origin.icao], ["Arrival", plan?.destination.icao], ["Alternate", plan?.alternate?.icao]].filter((x): x is [string, string] => !!x[1]);

  return (
    <div className="space-y-4">
      <h1 className="font-instrument text-4xl font-semibold">Network</h1>
      <Panel title="VATSIM at an airport" note="Live data from VATSIM">
        <form onSubmit={(e) => { e.preventDefault(); pick(input); }} className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-sm text-muted">Airport code</span>
            <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} maxLength={4} placeholder="EDDK" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              className="num mt-1 block w-40 rounded-lg border border-line bg-ink px-3 py-2.5 text-2xl uppercase" />
          </label>
          <button type="submit" className="min-h-12 rounded-lg bg-teal px-6 text-lg font-semibold text-on-teal">Show ATC</button>
          {planAirports.map(([label, code]) => (
            <button key={label} type="button" onClick={() => pick(code)} className="min-h-12 rounded-lg border border-line px-4 text-lg"><span className="text-muted">{label} </span><span className="num font-medium">{code}</span></button>
          ))}
        </form>
      </Panel>

      {error && <p role="alert" className="text-alert">{error}</p>}
      {!icao && !error && <EmptyState title="Pick an airport" hint="Type an airport code, or use the buttons once your SimBrief plan is loaded." />}
      {icao && !data && loading && <EmptyState title={`Checking ${icao}`} hint="Reading the VATSIM data feed." />}

      {data && (
        <>
          <div className="flex items-center justify-between text-sm text-muted">
            <span>VATSIM data {utcTime(data.updatedAt)} &middot; checked {ago(data.fetchedAt)}</span>
            {data.stale && <span className="text-amber">VATSIM unreachable, showing older data</span>}
          </div>
          <Panel title={`Controllers at ${data.icao}`} note={`${data.controllers.length} online`}>
            {data.controllers.length === 0 ? (
              <EmptyState title="No controllers online" hint="Nobody is staffing a position with this airport's callsign prefix. Approach and centre may still cover it from another callsign." />
            ) : (
              <table className="w-full text-lg">
                <thead className="text-left text-sm text-muted"><tr><th className="py-2">Position</th><th>Callsign</th><th>Controller</th><th className="text-right">Frequency</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {data.controllers.map((c) => (
                    <tr key={c.callsign}><td className="py-2.5 font-medium">{c.position}</td><td className="num text-muted">{c.callsign}</td><td>{c.name ?? "\u2014"}</td><td className="num text-right text-2xl text-teal">{c.frequency ?? "\u2014"}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          <Panel title={`ATIS at ${data.icao}`} note={`${data.atis.length} online`}>
            {data.atis.length === 0 ? <EmptyState title="No ATIS online" hint="No VATSIM ATIS is published for this airport right now." /> : (
              <div className="space-y-4">
                {data.atis.map((a) => (
                  <div key={a.callsign} className="rounded-lg bg-ink p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="num text-lg">{a.callsign}{a.code ? ` \u00b7 information ${a.code}` : ""}</span>
                      <span className="num text-2xl text-teal">{a.frequency ?? "\u2014"}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap font-mono text-base text-muted">{a.text.length ? a.text.join("\n") : "No ATIS text published."}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
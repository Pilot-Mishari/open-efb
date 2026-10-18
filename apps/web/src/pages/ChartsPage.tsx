import { Link } from "react-router-dom";
import { Panel } from "../components/Panel";
import { buildEmbeddedBrowserUrl } from "../lib/browser";
import { CHARTFOX_URL, NAVIGRAPH_URL } from "../lib/links";
import { usePlan } from "../lib/plan-context";
import { useSettings } from "../lib/settings-context";

interface Provider { id: "chartfox" | "navigraph"; name: string; url: string; blurb: string; needs: string }

const PROVIDERS: Provider[] = [
  { id: "chartfox", name: "ChartFox", url: CHARTFOX_URL, blurb: "Free charts gathered from official sources, with a free account.", needs: "Free account" },
  { id: "navigraph", name: "Navigraph Charts", url: NAVIGRAPH_URL, blurb: "Jeppesen charts, including SIDs, STARs, approaches and taxi diagrams.", needs: "Your own Navigraph subscription" },
];

export function ChartsPage() {
  const { settings } = useSettings();
  const { plan } = usePlan();
  const ordered = [...PROVIDERS].sort((a) => (a.id === settings.chartsProvider ? -1 : 1));
  const airports = [["Departure", plan?.origin.icao], ["Arrival", plan?.destination.icao], ["Alternate", plan?.alternate?.icao]].filter((x): x is [string, string] => !!x[1]);

  return (
    <div className="space-y-4">
      <h1 className="font-instrument text-4xl font-semibold">Charts</h1>
      {airports.length > 0 && (
        <Panel title="Airports for this flight" note="Search for these once the chart site opens">
          <div className="flex flex-wrap gap-3">
            {airports.map(([label, code]) => (
              <div key={label} className="rounded-lg bg-ink px-5 py-3"><div className="text-sm text-muted">{label}</div><div className="num text-3xl font-semibold">{code}</div></div>
            ))}
          </div>
        </Panel>
      )}
      <div className="grid grid-cols-2 gap-4">
        {ordered.map((p, i) => {
          const browserUrl = buildEmbeddedBrowserUrl(p.url);
          return (
            <Link key={p.id} to={browserUrl ?? "/"}
              className={`flex min-h-52 flex-col justify-between rounded-2xl p-6 ${i === 0 ? "bg-teal text-on-teal" : "border border-line bg-panel hover:bg-panel-hi"}`}>
              <div>
                <div className="font-instrument text-3xl font-semibold">{p.name}</div>
                <p className="mt-2 text-lg">{p.blurb}</p>
              </div>
              <div className="mt-6 flex items-end justify-between gap-4">
                <span className={`text-sm ${i === 0 ? "" : "text-muted"}`}>Needs: {p.needs}</span>
                <span className="shrink-0 whitespace-nowrap font-instrument text-xl font-semibold">Open in EFB browser &rarr;</span>
              </div>
            </Link>
          );
        })}
      </div>
      <Panel title="How charts load in the EFB">
        <p className="text-lg text-muted">Charts stay on the provider's own site, under your own account. Instead of launching a separate tab, Open EFB opens each chart service inside its own embedded browser view so the chart remains part of the app.</p>
      </Panel>
    </div>
  );
}
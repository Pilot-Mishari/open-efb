import { useState } from "react";
import type { Settings } from "@open-efb/shared";
import { EmptyState, Panel, SectionLayout } from "../components/Panel";
import { useSettings } from "../lib/settings-context";

function Choice<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: readonly T[]; onPick: (v: T) => void }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-4 last:border-b-0">
      <span className="text-lg">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex overflow-hidden rounded-lg border border-line">
        {options.map((o) => (
          <button key={o} role="radio" aria-checked={o === value} onClick={() => onPick(o)}
            className={`num min-h-12 min-w-20 px-5 text-lg ${o === value ? "bg-teal font-semibold text-on-teal" : "bg-ink text-muted"}`}>{o}</button>
        ))}
      </div>
    </div>
  );
}

const SECTIONS = ["Display", "Network access", "About"];

export function SettingsPage() {
  const { settings, update, server, version } = useSettings();
  const [section, setSection] = useState(SECTIONS[0]!);
  const [error, setError] = useState<string | null>(null);

  const save = async (patch: Parameters<typeof update>[0]) => {
    setError(null);
    try {
      await update(patch);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      setError(msg === "admin_local_only" ? "Settings can only be changed from the computer running Open EFB." : `Could not save: ${msg}`);
    }
  };
  const units = (k: keyof Settings["units"]) => <T extends string>(v: T) => save({ units: { ...settings.units, [k]: v } as Settings["units"] });

  return (
    <SectionLayout sections={SECTIONS} active={section} onSelect={setSection}>
      <h1 className="font-instrument text-4xl font-semibold">Settings</h1>
      {server === "offline" && <p role="alert" className="text-alert">The server is unreachable, so changes cannot be saved.</p>}
      {error && <p role="alert" className="text-alert">{error}</p>}
      {section === "Display" && (
        <>
          <Panel title="Theme"><Choice label="Colour scheme" value={settings.theme} options={["dark", "light"] as const} onPick={(v) => save({ theme: v })} /></Panel>
          <Panel title="Units">
            <Choice label="Altitude" value={settings.units.altitude} options={["ft", "m"] as const} onPick={units("altitude")} />
            <Choice label="Speed" value={settings.units.speed} options={["kt", "kmh"] as const} onPick={units("speed")} />
            <Choice label="Temperature" value={settings.units.temperature} options={["C", "F"] as const} onPick={units("temperature")} />
            <Choice label="Weight" value={settings.units.weight} options={["kg", "lb"] as const} onPick={units("weight")} />
          </Panel>
        </>
      )}
      {section === "Network access" && (
        <Panel title="Tablet connection" note="Not available yet">
          <EmptyState title="This computer only" hint="Opening Open EFB to a tablet on your Wi-Fi needs pairing and sign-in, which come with the next milestone." />
        </Panel>
      )}
      {section === "About" && (
        <Panel title="Open EFB">
          <dl className="space-y-2 text-lg">
            <div className="flex justify-between"><dt className="text-muted">Version</dt><dd className="num">{version ?? "unknown"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Licence</dt><dd>MIT, free and open source</dd></div>
          </dl>
        </Panel>
      )}
    </SectionLayout>
  );
}

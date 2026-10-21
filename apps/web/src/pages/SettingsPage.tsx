import { useEffect, useState } from "react";
import type { Settings } from "@open-efb/shared";
import { EmptyState, Panel, SectionLayout } from "../components/Panel";
import { describeError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
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

const SECTIONS = ["Display", "Integrations", "Network access", "About"];

export function SettingsPage() {
  const { role, label, logout } = useAuth();
  const { settings, update, server, version } = useSettings();
  const [section, setSection] = useState(SECTIONS[0]!);
  const [error, setError] = useState<string | null>(null);
  const [simbrief, setSimbrief] = useState(settings.simbriefUser);
  useEffect(() => setSimbrief(settings.simbriefUser), [settings.simbriefUser]);

  const save = async (patch: Parameters<typeof update>[0]) => {
    setError(null);
    try {
      await update(patch);
    } catch (e) {
      setError(describeError(e));
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
      {section === "Integrations" && (
        <>
          <Panel title="SimBrief" note="Loads your latest flight plan">
            <form onSubmit={(e) => { e.preventDefault(); void save({ simbriefUser: simbrief.trim() }); }} className="flex items-end gap-3">
              <label className="block flex-1">
                <span className="text-sm text-muted">Username or Pilot ID</span>
                <input value={simbrief} onChange={(e) => setSimbrief(e.target.value)} maxLength={64} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Your SimBrief username (Navigraph alias)"
                  className="mt-1 block w-full rounded-lg border border-line bg-ink px-3 py-2.5 text-lg" />
              </label>
              <button type="submit" className="min-h-12 rounded-lg bg-teal px-6 text-lg font-semibold text-on-teal">Save</button>
            </form>
            <p className="mt-3 text-sm text-muted">A numeric value is treated as your Pilot ID. Only your most recent plan is read, and no password is needed.</p>
          </Panel>
          <Panel title="Charts">
            <Choice label="Show first" value={settings.chartsProvider} options={["chartfox", "navigraph"] as const} onPick={(v) => save({ chartsProvider: v })} />
          </Panel>
        </>
      )}
            {section === "Network access" && (role === "client" ? (
        <Panel title="This device" note={label ?? ""}>
          <p className="text-lg text-muted">This device is paired with the PC. Disconnecting means you will need a new code to use it again.</p>
          <button onClick={() => void logout()} className="mt-4 min-h-12 rounded-lg border border-line px-6 text-lg">Disconnect this device</button>
        </Panel>
      ) : (
        <Panel title="Tablet connection">
          <EmptyState title="Managed from the tray" hint="Right-click the Open EFB tray icon and choose Connect a tablet to turn on network access, see the QR code and pairing code, and disconnect devices." />
        </Panel>
      ))}
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
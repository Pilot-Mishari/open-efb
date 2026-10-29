import { GSX_SERVICE_LABELS, GSX_SERVICE_ORDER, GSX_SERVICE_STATES, type GsxService } from "@open-efb/shared";
import { EmptyState, Panel } from "../components/Panel";
import { ago } from "../lib/format";
import { activeService, gsxConnectionLabel, serviceState, useGsx } from "../lib/gsx-state";

/**
 * Ground services: a read-only mirror of GSX Pro. Every line on this screen is something GSX
 * itself sent over its Remote API — no status, count or percentage is ever derived, so a service
 * GSX has not reported simply says so instead of being guessed.
 */

const TONE: Record<string, string> = {
  Active: "border-teal/60 bg-teal/10 text-text",
  Requested: "border-amber/60 bg-amber/10 text-text",
  Completing: "border-amber/60 bg-amber/10 text-text",
  Completed: "border-line bg-panel text-muted",
  Available: "border-line bg-panel text-text",
};

function ServiceTile({ service }: { service: GsxService }) {
  const state = serviceState(service) ?? "Unknown";
  const tone = TONE[state] ?? "border-line bg-panel text-muted";
  return (
    <div className={`flex min-h-32 flex-col justify-between rounded-2xl border p-4 ${tone}`}>
      <div>
        <span className="font-instrument text-2xl font-semibold">{GSX_SERVICE_LABELS[service.id]}</span>
        <span className="mt-1 block text-sm uppercase tracking-[0.18em] text-muted">{state}</span>
      </div>
      {/* GSX's own wording, shown as-is and never parsed into a number. */}
      {service.progressText && <p className="text-base text-text/80">{service.progressText}</p>}
      {!service.progressText && service.operator && <p className="text-sm text-muted">{service.operator}</p>}
    </div>
  );
}

function UnknownTile({ id }: { id: (typeof GSX_SERVICE_ORDER)[number] }) {
  return (
    <div className="flex min-h-32 flex-col justify-between rounded-2xl border border-dashed border-line p-4 text-muted">
      <span className="font-instrument text-2xl font-semibold text-text/60">{GSX_SERVICE_LABELS[id]}</span>
      <span className="text-sm">Not reported</span>
    </div>
  );
}

export function GroundPage() {
  const gsx = useGsx();
  const conn = gsxConnectionLabel(gsx);
  const current = activeService(gsx.services);
  const listed = new Set(gsx.services.map((s) => s.id));

  const dot = conn.tone === "ok" ? "bg-teal" : conn.tone === "warn" ? "bg-amber" : "bg-line";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-instrument text-4xl font-semibold">Ground services</h1>
          <p className="mt-1 text-muted">Live status from GSX Pro. Read-only — nothing here starts or stops a service.</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-2.5" role="status">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
          <span className="text-sm font-medium">{conn.label}</span>
          {gsx.updatedAt !== null && <span className="text-sm text-muted">· updated {ago(gsx.updatedAt)}</span>}
        </div>
      </header>

      {gsx.detail && gsx.connection !== "connected" && (
        <p className="rounded-xl border border-line bg-panel px-4 py-3 text-sm text-muted">{gsx.detail}</p>
      )}

      {gsx.connection === "connected" && (
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ["Simulator", gsx.sim],
            ["Airport", gsx.airport ? `${gsx.airport.icao}${gsx.airport.name ? ` — ${gsx.airport.name}` : ""}` : null],
            ["Stand", gsx.gate ? (gsx.gate.terminal ? `${gsx.gate.name} · ${gsx.gate.terminal}` : gsx.gate.name) : null],
            ["Aircraft", gsx.aircraft?.icaoType ?? null],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl border border-line bg-panel px-4 py-3">
              <span className="block text-xs uppercase tracking-[0.2em] text-muted">{label}</span>
              <span className="block truncate font-medium">{value ?? "Unavailable"}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          {gsx.connection === "connected" && gsx.services.length > 0 ? (
            <>
              {current && (
                <p className="mb-3 rounded-xl border border-teal/40 bg-teal/10 px-4 py-3">
                  <span className="font-instrument text-lg font-semibold">
                    {GSX_SERVICE_LABELS[current.id]} — {serviceState(current.service)}
                  </span>
                  {current.service.progressText && <span className="ml-2 text-muted">{current.service.progressText}</span>}
                </p>
              )}
              <div className="grid grid-cols-3 gap-3">
                {GSX_SERVICE_ORDER.map((id) =>
                  listed.has(id) ? (
                    <ServiceTile key={id} service={gsx.services.find((s) => s.id === id)!} />
                  ) : (
                    <UnknownTile key={id} id={id} />
                  ),
                )}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-line p-6">
              <EmptyState
                title={gsx.connection === "connected" ? "No service data yet" : "No ground service link"}
                hint={
                  gsx.connection === "connected"
                    ? "GSX is connected but has not published any services. Services appear as soon as GSX starts them at the stand."
                    : "Ground services appear here as soon as GSX Pro is running with its Remote control server enabled in GSX Settings."
                }
              />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Pushback" note={gsx.pushback ? "Stand data" : "Unavailable"}>
            {gsx.pushback ? (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-[0.2em] text-muted">Stand directions</dt>
                  <dd className="font-medium">
                    {gsx.pushback.directions.length > 0 ? gsx.pushback.directions.join(" · ") : "Unavailable"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.2em] text-muted">Tug type</dt>
                  <dd className="font-medium">{gsx.pushback.tugType ?? "Unavailable"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.2em] text-muted">Pushback</dt>
                  <dd className="font-medium">
                    {gsx.pushback.service ? (serviceState(gsx.pushback.service) ?? "Unavailable") : "Unavailable"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted">
                GSX has not reported this stand. Directions listed are what the parking allows, not a selection.
              </p>
            )}
          </Panel>

          <Panel title="Connection" note={conn.label}>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Interface</dt>
                <dd>GSX Remote API</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Protocol</dt>
                <dd>{gsx.protocol !== null ? `v${gsx.protocol}` : "Unavailable"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">GSX engine</dt>
                <dd>
                  {gsx.gsxRunning === null ? "Unavailable" : gsx.gsxRunning ? "Running" : "Not running"}
                </dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}

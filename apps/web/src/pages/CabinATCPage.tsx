import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SeatBadge } from "../components/SeatBadge";
import { buildEmbeddedBrowserUrl, buildVatsimListenUrl, normalizeVatsimStationId } from "../lib/browser";

const EXAMPLE_STATION = "OTHH_1_GND";

export function CabinATCPage() {
  const navigate = useNavigate();
  const [station, setStation] = useState(EXAMPLE_STATION);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalized = normalizeVatsimStationId(station);
    if (!normalized) {
      setError("Use a station ID in the format airport_#_service, for example OTHH_1_GND.");
      return;
    }

    const url = buildVatsimListenUrl(normalized);
    if (!url) {
      setError("Only official VATSIM Listen station URLs are supported.");
      return;
    }

    const browserUrl = buildEmbeddedBrowserUrl(url, {
      route: "/cabin/browser",
      returnTo: "/cabin/home",
    });

    if (!browserUrl) {
      setError("The official VATSIM Listen site did not provide a valid browser target.");
      return;
    }

    setError(null);
    navigate(browserUrl);
  };

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
          Open the official VATSIM Listen page for a controller station. Only direct station IDs from the official
          https://listen.vatsim.net/ format are allowed.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="vatsim-station" className="mb-2 block text-sm uppercase tracking-[0.2em] text-muted">
              Station ID
            </label>
            <input
              id="vatsim-station"
              type="text"
              value={station}
              onChange={(event) => {
                setStation(event.target.value.toUpperCase());
                setError(null);
              }}
              placeholder="OTHH_1_GND"
              className="w-full rounded-2xl border border-line bg-ink px-4 py-3 text-xl text-text outline-none transition focus:border-teal"
              aria-invalid={Boolean(error)}
            />
          </div>

          <div className="rounded-2xl border border-dashed border-line bg-ink p-4 text-sm text-muted">
            Example: OTHH_1_GND · airport code, controller number, service type.
          </div>

          {error && (
            <div className="rounded-2xl border border-amber/60 bg-amber/10 px-4 py-3 text-base text-amber">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-full bg-teal px-6 py-3 text-lg font-semibold text-on-teal hover:bg-teal-deep"
            >
              Open station
            </button>
            <button
              type="button"
              onClick={() => navigate("/cabin/home")}
              className="rounded-full border border-line px-6 py-3 text-lg text-text hover:bg-panel-hi"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

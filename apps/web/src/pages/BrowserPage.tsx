import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";

function normalizeTarget(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  return raw;
}

export function BrowserPage() {
  const [params] = useSearchParams();
  const target = useMemo(() => normalizeTarget(params.get("url")), [params]);
  const returnTo = useMemo(() => normalizeReturnTo(params.get("returnTo")), [params]);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {returnTo ? (
            <Link to={returnTo} className="rounded-lg border border-line bg-panel px-4 py-2.5 text-lg">Back to CabinView</Link>
          ) : (
            <Link to="/home" className="rounded-lg border border-line bg-panel px-4 py-2.5 text-lg">Back to dashboard</Link>
          )}
          <div className="text-sm text-muted">Embedded browser</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {target && (
            <a href={target} target="_blank" rel="noreferrer noopener"
              className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-text hover:bg-panel-hi">
              Open in browser
            </a>
          )}
          <div className="max-w-xl truncate rounded-lg border border-line bg-panel px-3 py-2 text-sm text-muted">
            {target ? new URL(target).hostname : "No page selected"}
          </div>
        </div>
      </div>

      {!target ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-line bg-panel p-12 text-center text-lg text-muted">
          <div>
            <p className="text-2xl font-semibold text-text">No page was selected</p>
            <p className="mt-2">Open a chart or OFP from inside the EFB to load it here.</p>
          </div>
        </div>
      ) : (
        <iframe
          key={target}
          title="In-app browser"
          src={target}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
          referrerPolicy="no-referrer-when-downgrade"
          className="min-h-[72vh] w-full flex-1 rounded-2xl border border-line bg-black"
        />
      )}
    </div>
  );
}

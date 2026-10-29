import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SetupItem, SetupStatus, SetupStatusKind } from "@open-efb/shared";
import { api, describeError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useSettings } from "../lib/settings-context";

/**
 * The first-launch setup wizard. Every row comes straight from GET /api/setup, which re-checks
 * this computer on each call — the dialog never computes a status itself and never invents a fix.
 * "Finish" persists completion (it then never auto-opens again); "Skip for now" only closes it for
 * this session, so the wizard returns on the next launch until setup is actually finished.
 */

const CHIP: Record<SetupStatusKind, { label: string; cls: string }> = {
  connected: { label: "Connected", cls: "bg-teal text-on-teal" },
  needs_setup: { label: "Needs setup", cls: "bg-amber text-on-teal" },
  optional: { label: "Optional", cls: "bg-panel-hi text-text border border-line" },
  unavailable: { label: "Unavailable", cls: "bg-ink text-muted border border-line" },
};

function StatusChip({ status }: { status: SetupStatusKind }) {
  const c = CHIP[status];
  return <span className={`num shrink-0 rounded-full px-3 py-1 text-sm font-semibold uppercase tracking-wide ${c.cls}`}>{c.label}</span>;
}

function Row({ item, busy, onTest, onSave, chartsOpen }: {
  item: SetupItem;
  busy: boolean;
  onTest: () => void;
  onSave: (user: string) => void;
  chartsOpen: () => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <li className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-instrument text-xl font-semibold">{item.title}</h3>
        <StatusChip status={item.status} />
      </div>
      <p className="mt-1.5 text-muted">{item.detail}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {item.id === "simbrief" && item.action === "save" && (
          <form
            className="flex flex-1 flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) onSave(draft.trim());
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={64}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="SimBrief username or Pilot ID"
              aria-label="SimBrief username or Pilot ID"
              className="min-w-48 flex-1 rounded-lg border border-line bg-ink px-3 py-2.5 text-lg"
            />
            <button type="submit" disabled={busy || !draft.trim()}
              className="min-h-11 rounded-lg bg-teal px-5 font-semibold text-on-teal disabled:opacity-50">
              Save
            </button>
          </form>
        )}
        {item.id === "simbrief" && item.action === "test" && (
          <button onClick={onTest} disabled={busy} className="min-h-11 rounded-lg border border-line px-5 text-lg disabled:opacity-50">
            {busy ? "Testing…" : "Test"}
          </button>
        )}
        {item.action === "test" && item.id !== "simbrief" && (
          <button onClick={onTest} disabled={busy} className="min-h-11 rounded-lg border border-line px-5 text-lg disabled:opacity-50">
            {busy ? "Testing…" : "Test"}
          </button>
        )}
        {item.action === "open" && (
          <button onClick={chartsOpen} className="min-h-11 rounded-lg border border-line px-5 text-lg">
            Open charts
          </button>
        )}
      </div>
    </li>
  );
}

export function SetupWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role } = useAuth();
  const { settings, update } = useSettings();
  const navigate = useNavigate();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const refresh = useCallback(async (force: boolean) => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await api.setup(force));
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh(true);
  }, [open, refresh]);

  if (!open) return null;

  const saveSimbrief = async (user: string) => {
    setBusyId("simbrief");
    try {
      await update({ simbriefUser: user });
      await refresh(true);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusyId(null);
    }
  };

  const finish = async () => {
    setFinishing(true);
    setError(null);
    try {
      await api.completeSetup();
      onClose();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setFinishing(false);
    }
  };

  const needsSetup = status?.items.filter((i) => i.status === "needs_setup").length ?? 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="First-time setup">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h1 className="font-instrument text-3xl font-semibold">Set up Open EFB</h1>
            <p className="mt-1 text-muted">
              Each row below is a live check on this computer. Everything works without setup — configure what you need and skip the rest.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close setup for now"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line text-xl text-muted hover:text-text">
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {error && <p role="alert" className="rounded-lg border border-alert/40 bg-alert/10 px-4 py-3 text-alert">{error}</p>}
          {loading && !status && <p className="py-8 text-center text-muted">Checking this computer…</p>}
          {status?.items.map((item) => (
            <Row key={item.id} item={item} busy={busyId === item.id}
              onTest={() => void refresh(true)}
              onSave={(u) => void saveSimbrief(u)}
              chartsOpen={() => { onClose(); navigate("/charts"); }} />
          ))}
          {settings.setupCompleted && (
            <p className="text-sm text-muted">Setup was already completed once; you reopened it from Settings. Changes here save immediately.</p>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
          <span className="text-sm text-muted">
            {loading && status ? "Re-checking…" : status ? `${needsSetup} item${needsSetup === 1 ? "" : "s"} still need setup` : ""}
          </span>
          <div className="flex gap-3">
            <button onClick={onClose} className="min-h-12 rounded-lg border border-line px-6 text-lg">
              Skip for now
            </button>
            <button onClick={() => void finish()} disabled={finishing}
              className="min-h-12 rounded-lg bg-teal px-6 text-lg font-semibold text-on-teal disabled:opacity-60">
              {finishing ? "Saving…" : "Finish setup"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

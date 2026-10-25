import type { ReactNode } from "react";

export function Panel({ title, children, className = "", note }: { title: string; children: ReactNode; className?: string; note?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-panel ${className}`}>
      <header className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-3">
        <h2 className="font-instrument text-xl font-semibold">{title}</h2>
        {note && <span className="text-sm text-muted">{note}</span>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Shown wherever real data does not exist yet. Says what is missing and how to fix it. */
export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-5 py-8 text-center">
      <p className="font-instrument text-xl font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-muted">{hint}</p>
    </div>
  );
}

/** Left-hand section list used by modules and Settings. */
export function SectionLayout({ sections, active, onSelect, children }: { sections: string[]; active: string; onSelect: (s: string) => void; children: ReactNode }) {
  return (
    <div className="flex h-full gap-6">
      <nav aria-label="Sections" className="w-52 shrink-0 space-y-1">
        {sections.map((s) => (
          <button key={s} onClick={() => onSelect(s)} aria-current={s === active ? "true" : undefined}
            className={`block w-full rounded-lg px-4 py-3 text-left text-lg ${s === active ? "bg-panel-hi font-medium text-text" : "text-muted hover:text-text"}`}>
            {s}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 space-y-4">{children}</div>
    </div>
  );
}

export function PreviewNote() {
  return <p className="text-sm text-muted">This screen shows the planned layout. It has no data and nothing here is live yet.</p>;
}

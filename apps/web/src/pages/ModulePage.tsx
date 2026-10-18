import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { EmptyState, Panel, PreviewNote, SectionLayout } from "../components/Panel";
import { MODULES } from "../lib/modules";

/** Generic module screen: optional section list plus honest empty states. */
export function ModulePage() {
  const { pathname } = useLocation();
  const mod = MODULES.find((m) => m.path === pathname);
  const [active, setActive] = useState<string | null>(null);
  if (!mod) return <Navigate to="/" replace />;

  const current = active && mod.sections?.includes(active) ? active : (mod.sections?.[0] ?? mod.name);
  const needsPlan = ["briefing"].includes(mod.id);
  const body = (
    <>
      <h1 className="font-instrument text-4xl font-semibold">{mod.name}</h1>
      <Panel title={current} note="No data">
        <EmptyState
          title={needsPlan ? "No flight plan loaded" : `${current} is not available yet`}
          hint={needsPlan ? `Once flight plan import is built, ${current.toLowerCase()} details will appear here.` : mod.blurb + "."}
        />
      </Panel>
      <PreviewNote />
    </>
  );
  return mod.sections ? <SectionLayout sections={mod.sections} active={current} onSelect={setActive}>{body}</SectionLayout> : <div className="space-y-4">{body}</div>;
}

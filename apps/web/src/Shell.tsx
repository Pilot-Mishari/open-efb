import { NavLink, Outlet } from "react-router-dom";
import { FlightHeader } from "./components/FlightHeader";
import { Icon, type IconName } from "./lib/icons";
import { MODULES } from "./lib/modules";
import { useLiveLink } from "./lib/live-link";
import { useSettings } from "./lib/settings-context";
import { useSimState, type SimKind } from "./lib/sim-state";

const LINK_TEXT = { connecting: "Live link starting", open: "Live link connected", reconnecting: "Live link reconnecting" } as const;
const STATUS_TEXT = { connecting: "Reaching server", online: "Server online", offline: "Server unreachable" } as const;

const SIM_DOT: Record<SimKind, string> = {
  live: "bg-teal", mock: "bg-amber", stale: "bg-amber", "waiting-sim": "bg-amber", connecting: "bg-amber", waiting: "bg-amber",
  disconnected: "bg-line", "no-link": "bg-line", disabled: "bg-line",
};

function RailLink({ to, icon, label, end = false }: { to: string; icon: IconName; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} aria-label={label}
      className={({ isActive }) =>
        `group relative flex items-center gap-4 rounded-lg px-4 py-3 text-lg font-medium ${isActive ? "bg-panel-hi text-text" : "text-muted hover:text-text"}`
      }>
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-teal" />}
          <Icon name={icon} className="h-6 w-6 shrink-0" />
          <span className="hidden lg:inline">{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Shell() {
  const { server, version } = useSettings();
  const link = useLiveLink();
  const sim = useSimState();
  const linkDot = link === "open" ? "bg-teal" : "bg-amber";
  const dot = server === "online" ? "bg-teal" : server === "offline" ? "bg-alert" : "bg-amber";

  return (
    <div className="flex h-full">
      <nav aria-label="Main" className="flex w-20 shrink-0 flex-col border-r border-line bg-ink p-3 lg:w-60">
        <div className="mb-5 flex items-center gap-3 px-2 pt-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal text-on-teal"><Icon name="cabin" className="h-5 w-5" /></span>
          <div className="hidden lg:block">
            <div className="font-instrument text-xl font-semibold leading-none">Open EFB</div>
            {version && <div className="num mt-1 text-sm text-muted">v{version}</div>}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
          <RailLink to="/" end icon="home" label="Home" />
          {MODULES.map((m) => <RailLink key={m.id} to={m.path} icon={m.icon} label={m.name} />)}
        </div>
        <div className="mt-3 border-t border-line pt-3">
          <RailLink to="/settings" icon="settings" label="Settings" />
          <div className="mt-2 hidden space-y-1.5 px-4 text-sm text-muted lg:block" role="status">
            <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${dot}`} />{STATUS_TEXT[server]}</div>
            <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${linkDot}`} />{LINK_TEXT[link]}</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-line" />Simulator not connected</div>
          </div>
          <div className="mt-2 flex justify-center gap-1.5 lg:hidden" role="status" aria-label={`${STATUS_TEXT[server]}. ${LINK_TEXT[link]}. Simulator not connected.`}>
            <span className={`h-2.5 w-2.5 rounded-full ${dot}`} /><span className={`h-2.5 w-2.5 rounded-full ${linkDot}`} /><span className="h-2.5 w-2.5 rounded-full bg-line" />
          </div>
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <FlightHeader />
        <main className="min-h-0 flex-1 overflow-y-auto p-8"><Outlet /></main>
      </div>
    </div>
  );
}
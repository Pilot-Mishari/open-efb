import type { ControlApi, ControlState } from "./types";

declare global {
  interface Window {
    efbControl: ControlApi;
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const api = window.efbControl;
let state: ControlState | null = null;
let busy = false;

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

function tickExpiry(): void {
  const p = state?.access.pairing;
  $("expires").textContent = p ? `Expires in ${Math.max(0, Math.round((p.expiresAt - Date.now()) / 1000))} s` : "";
}

function render(s: ControlState): void {
  state = s;
  const a = s.access;
  $("version").textContent = `Version ${s.version}`;
  $("sim-text").textContent = s.simulator;
  $("server").textContent = a.running ? "Server running" : "Server stopped";
  $("lan-text").textContent = a.lanEnabled ? "On. Tablets on your Wi-Fi can connect with a code." : "Off. Only this computer can use Open EFB.";
  const toggle = $<HTMLButtonElement>("lan");
  toggle.setAttribute("aria-checked", String(a.lanEnabled));
  toggle.disabled = busy || !a.running;
  $("lan-on").hidden = !(a.lanEnabled && a.running);

  const [first, ...others] = a.lanUrls;
  $("url").textContent = first ?? "No network address found";
  $("urls-extra").textContent = others.length ? `Other addresses: ${others.join(", ")}` : "";
  const qr = $<HTMLImageElement>("qr");
  qr.hidden = !s.qr;
  if (s.qr) qr.src = s.qr;
  $("code").textContent = a.pairing?.code ?? "----";
  tickExpiry();

  const list = $("devices");
  list.replaceChildren(
    ...a.clients.map((c) => {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = `dot${c.connected ? " on" : ""}`;
      const info = document.createElement("div");
      info.className = "grow";
      const name = document.createElement("div");
      name.textContent = c.label;
      const small = document.createElement("small");
      small.textContent = `${c.ip ?? "unknown address"} \u00b7 ${c.connected ? "connected" : `seen ${ago(c.lastSeen)}`}`;
      info.append(name, small);
      const btn = document.createElement("button");
      btn.textContent = "Disconnect";
      btn.addEventListener("click", () => void api.revoke(c.id));
      li.append(dot, info, btn);
      return li;
    }),
  );
  $("no-devices").hidden = a.clients.length > 0;
  $<HTMLButtonElement>("revoke-all").disabled = a.clients.length === 0;
  $("logs").textContent = s.logs.join("\n");
}

$("lan").addEventListener("click", async () => {
  if (!state) return;
  busy = true;
  render(state);
  try {
    await api.setLan(!state.access.lanEnabled);
  } finally {
    busy = false;
    render(await api.getState());
  }
});
$("rotate").addEventListener("click", () => void api.rotateCode());
$("revoke-all").addEventListener("click", () => void api.revokeAll());
$("open").addEventListener("click", () => void api.openApp());

api.onState(render);
void api.getState().then(render);
setInterval(tickExpiry, 1000);
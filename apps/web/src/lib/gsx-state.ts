import { GSX_SERVICE_STATES, emptyGsxStatus, type GsxService, type GsxServiceId, type GsxStatus } from "@open-efb/shared";
import { useGsxFeed } from "./live-link";

/**
 * GSX Pro's read-only ground-service state for the whole EFB. There is no polling: the server
 * pushes an update over the existing live socket whenever GSX itself changes, and this hook only
 * replays the latest one. With GSX absent every value stays null/empty and nothing else breaks.
 */
export function useGsx(): GsxStatus {
  const { message } = useGsxFeed();
  return message?.gsx ?? emptyGsxStatus("connecting", "Waiting for the server.");
}

/** GSX's own service state word, or null when that service is not listed at all. */
export function serviceState(service: GsxService | null | undefined): string | null {
  if (!service) return null;
  return GSX_SERVICE_STATES[service.stateRaw] ?? null;
}

/** True only while GSX itself says boarding (or deboarding) is requested or running. */
export function isBoardingActive(services: readonly GsxService[]): boolean {
  return services.some(
    (s) => (s.id === "Boarding" || s.id === "Deboarding") && (s.stateRaw === 4 || s.stateRaw === 5 || s.stateRaw === 7),
  );
}

/**
 * The boarding line CabinView may show, built only from what GSX sent: its own progress wording
 * when it wrote one, otherwise a plain statement that boarding is running. Null when GSX says
 * nothing about boarding, so the widget shows nothing rather than inventing a count.
 */
export function boardingStatus(services: readonly GsxService[]): string | null {
  const service = services.find((s) => s.id === "Boarding" || s.id === "Deboarding");
  if (!service) return null;
  if (service.stateRaw !== 4 && service.stateRaw !== 5 && service.stateRaw !== 7) return null;
  return service.progressText ?? (service.id === "Boarding" ? "Boarding in progress" : "Deboarding in progress");
}

/** The one service GSX currently has running, if any — used for the single "current operation" line. */
export function activeService(services: readonly GsxService[]): { id: GsxServiceId; service: GsxService } | null {
  const active = services.find((s) => s.stateRaw === 5);
  if (active) return { id: active.id, service: active };
  const requested = services.find((s) => s.stateRaw === 4 || s.stateRaw === 7);
  return requested ? { id: requested.id, service: requested } : null;
}

/** Connection wording shown in the EFB, in one place so every screen says the same thing. */
export function gsxConnectionLabel(status: GsxStatus): { label: string; tone: "ok" | "warn" | "off" } {
  switch (status.connection) {
    case "connected":
      return status.gsxRunning === false
        ? { label: "GSX connected, engine not running", tone: "warn" }
        : { label: "GSX Pro connected", tone: "ok" };
    case "connecting":
      return { label: "Looking for GSX Pro", tone: "off" };
    case "unreachable":
      return { label: "GSX Pro not reachable", tone: "warn" };
    case "unavailable":
      return { label: "GSX Pro not installed", tone: "off" };
  }
}

// Keep the compact header connection chip consistent across settings and PR pages.
import { HostConnectionState } from "./connectivity";

export interface HostStatusElements {
  dot: HTMLElement | null;
  status: HTMLElement | null;
  note: HTMLElement | null;
  chip: HTMLElement | null;
}

export function renderHostStatus(
  elements: HostStatusElements,
  state: HostConnectionState,
  checkedAt?: Date
): void {
  const time = checkedAt ? checkedAt.toLocaleTimeString() : "";
  if (elements.dot) {
    elements.dot.className = state === "connected"
      ? "status-dot ready"
      : state === "disconnected"
        ? "status-dot error"
        : "status-dot";
  }
  if (elements.status) {
    elements.status.textContent = state === "connected"
      ? "Azure DevOps host connected."
      : state === "disconnected"
        ? "Not connected to Azure DevOps."
        : "Checking Azure DevOps connection...";
  }
  if (elements.note) {
    elements.note.textContent = state === "disconnected"
      ? "Retrying automatically"
      : "Azure DevOps host";
  }
  if (elements.chip) {
    elements.chip.title = state === "disconnected"
      ? `Last checked ${time || "now"}; retrying automatically.`
      : state === "connected"
        ? `Host connection checked at ${time || "now"}.`
        : "Reports only the Azure DevOps extension host connection.";
  }
}

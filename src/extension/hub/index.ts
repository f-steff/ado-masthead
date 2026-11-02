// The Azure DevOps host keeps the iframe hidden until the extension explicitly
// finishes its handshake. This entry point owns that handshake and then reports
// only non-sensitive host and version information in the hub.
import * as SDK from "azure-devops-extension-sdk";

const statusText = document.querySelector<HTMLElement>("#host-status");
const statusDot = document.querySelector<HTMLElement>("#status-dot");
const hostMeta = document.querySelector<HTMLElement>("#host-meta");

/** Surface load failures without exposing host details in an error message. */
function showFailure(): void {
  if (statusDot) statusDot.className = "status-dot error";
  if (statusText) statusText.textContent = "Azure DevOps host connection failed.";
  if (hostMeta) hostMeta.textContent = "Reload the page or check that the extension is enabled.";
}

/** Complete the host handshake before revealing the page. */
async function initializeHub(): Promise<void> {
  try {
    await SDK.init({ loaded: false, applyTheme: true });
    await SDK.ready();
    const host = SDK.getHost();
    const extension = SDK.getExtensionContext();
    if (statusDot) statusDot.className = "status-dot ready";
    if (statusText) statusText.textContent = "Connected to Azure DevOps.";
    if (hostMeta) {
      hostMeta.textContent = `${host.name} - Masthead ${extension.version}`;
    }
    await SDK.notifyLoadSucceeded();
  } catch {
    showFailure();
    // init() can fail before a host exists; notification failures are ignored.
    await SDK.notifyLoadFailed("Masthead could not initialize the Azure DevOps host.").catch(() => undefined);
  }
}

void initializeHub();

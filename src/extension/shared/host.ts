// Both settings pages need the same host handshake. The hub host keeps the
// iframe hidden; notify only after the SDK is ready, then load page data.
import * as SDK from "azure-devops-extension-sdk";

export interface HostContext {
  host: SDK.IHostContext;
  extension: SDK.IExtensionContext;
}

export async function initializeHost(): Promise<HostContext> {
  await SDK.init({ loaded: false, applyTheme: true });
  await SDK.ready();
  return { host: SDK.getHost(), extension: SDK.getExtensionContext() };
}

export function notifyHostLoaded(): Promise<void> {
  return SDK.notifyLoadSucceeded();
}

/**
 * The extension iframe is served from gallerycdn.vsassets.io, so its
 * window.location.origin is not the Azure DevOps REST origin. Build the cloud
 * organization URL explicitly; the manifest targets Azure DevOps Services.
 */
export function organizationUrl(hostName: string): string {
  return `https://dev.azure.com/${encodeURIComponent(hostName)}`;
}

export function notifyHostFailed(message: string): Promise<void> {
  return SDK.notifyLoadFailed(message).catch(() => undefined);
}

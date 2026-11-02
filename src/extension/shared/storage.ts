// Settings are application data, never secrets. Extension Data Service is
// account-scoped by default, so every administrator sees the same switches.
import * as SDK from "azure-devops-extension-sdk";

const EXTENSION_DATA_SERVICE = "ms.vss-features.extension-data-service";

interface ExtensionDataManager {
  getValue<T>(key: string, options?: { defaultValue?: T }): Promise<T>;
  setValue<T>(key: string, value: T): Promise<T>;
}

interface ExtensionDataService {
  getExtensionDataManager(extensionId: string, accessToken: string): Promise<ExtensionDataManager>;
}

let manager: Promise<ExtensionDataManager> | undefined;

/** Lazily obtain the data manager so a settings page can render a useful error. */
async function dataManager(): Promise<ExtensionDataManager> {
  if (!manager) {
    manager = (async () => {
      const token = await SDK.getAccessToken();
      const service = await SDK.getService<ExtensionDataService>(EXTENSION_DATA_SERVICE);
      return service.getExtensionDataManager(SDK.getExtensionContext().id, token);
    })();
  }
  return manager;
}

export async function loadSetting<T>(key: string, fallback: T): Promise<T> {
  const value = await (await dataManager()).getValue<T>(key, { defaultValue: fallback });
  return value ?? fallback;
}

export async function saveSetting<T>(key: string, value: T): Promise<T> {
  return (await dataManager()).setValue<T>(key, value);
}

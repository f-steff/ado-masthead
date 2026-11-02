// Dedicated model-catalogue refresh entry point. This is intentionally separate
// from review execution: reviews use the cached catalogue and never wait for a
// provider management API. The pipeline should run this at most hourly.
import { listProviderModels, providerFromEnvironment } from "../providers";
import {
  isModelCatalogFresh,
  mergeProviderModels,
  normalizeModelCatalog
} from "../models/catalog";
import { resolveAdoAuth } from "./auth";
import { readExtensionSetting, writeExtensionSetting } from "./settings";

async function main(): Promise<void> {
  const env = process.env;
  const organizationUrl = required(env, "AZURE_DEVOPS_ORG_URL");
  const auth = resolveAdoAuth(env);
  const options = {
    organizationUrl,
    token: auth.token,
    tokenScheme: auth.scheme,
    publisher: (env.MASTHEAD_EXTENSION_PUBLISHER || "f-steff").trim(),
    extensionId: required(env, "MASTHEAD_EXTENSION_ID"),
    timeoutMs: 10_000
  };
  const provider = providerFromEnvironment(env);
  const existing = normalizeModelCatalog(await readExtensionSetting(options, "modelCatalog"));
  const force = /^(1|true|yes)$/i.test((env.MASTHEAD_FORCE_MODEL_REFRESH || "").trim());
  if (!force && isModelCatalogFresh(existing, provider.name)) {
    console.log(JSON.stringify({
      skipped: "model-catalog-fresh",
      provider: provider.name,
      refreshedAt: existing[provider.name]?.refreshedAt
    }, null, 2));
    return;
  }

  const models = await listProviderModels({ ...provider, timeoutMs: 8_000 });
  if (models.length === 0) {
    throw new Error("The provider returned no models.");
  }
  const refreshedAt = new Date().toISOString();
  const next = mergeProviderModels(existing, provider.name, models, refreshedAt);
  await writeExtensionSetting(options, "modelCatalog", next);
  console.log(JSON.stringify({
    provider: provider.name,
    modelCount: models.length,
    refreshedAt
  }, null, 2));
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = (env[name] || "").trim();
  if (!value) throw new Error(`Set ${name}.`);
  return value;
}

void main().catch((error: unknown) => {
  // Provider and ADO adapters already sanitize response bodies and credentials.
  console.error(error instanceof Error ? error.message : "Model catalogue refresh failed.");
  process.exitCode = 1;
});

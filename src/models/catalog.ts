// Provider model lists are advisory UI data, never credentials. The worker may
// refresh them from the provider management API; the settings UI falls back to
// a small built-in list and also accepts a custom model name.
import type { ProviderName } from "../providers";

export interface ProviderModelCatalog {
  models: string[];
  refreshedAt?: string;
}

export type ModelCatalog = Partial<Record<ProviderName, ProviderModelCatalog>>;

export const FALLBACK_MODELS: Record<ProviderName, readonly string[]> = {
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  openai: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "o3", "o4-mini"],
  anthropic: [
    "claude-sonnet-4-20250514",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-haiku-20241022"
  ]
};

/** Keep only provider names and bounded model-name strings from extension data. */
export function normalizeModelCatalog(value: unknown): ModelCatalog {
  if (!isRecord(value)) return {};
  const result: ModelCatalog = {};
  for (const provider of ["anthropic", "openai", "deepseek"] as const) {
    const entry = value[provider];
    if (!isRecord(entry) || !Array.isArray(entry.models)) continue;
    const models = entry.models
      .filter((model): model is string => typeof model === "string")
      .map((model) => model.trim())
      .filter((model) => model.length > 0 && model.length <= 200)
      .filter((model, index, all) => all.indexOf(model) === index)
      .slice(0, 200);
    if (!models.length) continue;
    result[provider] = {
      models,
      ...(typeof entry.refreshedAt === "string" && entry.refreshedAt.trim()
        ? { refreshedAt: entry.refreshedAt.slice(0, 80) }
        : {})
    };
  }
  return result;
}

/** Merge provider-discovered models with the built-in fallback, newest first. */
export function modelsForProvider(catalog: ModelCatalog, provider: ProviderName): string[] {
  const discovered = catalog[provider]?.models ?? [];
  return [...new Set([...discovered, ...FALLBACK_MODELS[provider]])];
}

export function allKnownModels(catalog: ModelCatalog): string[] {
  return [...new Set(
    (["anthropic", "openai", "deepseek"] as const)
      .flatMap((provider) => modelsForProvider(catalog, provider))
  )];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

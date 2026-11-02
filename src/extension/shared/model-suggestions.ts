// Model names are suggestions, not a closed enum. A datalist keeps custom
// names possible while the worker refreshes provider-discovered models.
import { allKnownModels, ModelCatalog, modelsForProvider } from "../../models/catalog";
import type { ProviderName } from "../../providers";

export function fillModelOptions(
  datalist: HTMLDataListElement | null,
  provider: string | undefined,
  catalog: ModelCatalog
): void {
  if (!datalist) return;
  datalist.replaceChildren();
  const knownProvider = provider === "anthropic" || provider === "openai" || provider === "deepseek"
    ? provider as ProviderName
    : undefined;
  const models = knownProvider ? modelsForProvider(catalog, knownProvider) : allKnownModels(catalog);
  for (const model of models) {
    const option = document.createElement("option");
    option.value = model;
    datalist.append(option);
  }
}

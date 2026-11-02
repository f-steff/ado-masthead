// The model catalogue is untrusted advisory metadata. Provider discovery must
// never leak a key or block a review when the endpoint is unavailable.
import assert from "node:assert/strict";
import test from "node:test";
import { buildProviderRequest, listProviderModels, providerFromEnvironment } from "../src/providers";
import {
  isModelCatalogFresh,
  mergeProviderModels,
  MODEL_CATALOG_TTL_MS,
  modelsForProvider,
  normalizeModelCatalog
} from "../src/models/catalog";

test("model catalogue normalization bounds provider names and model strings", () => {
  const catalog = normalizeModelCatalog({
    deepseek: { models: ["deepseek-chat", "deepseek-chat", "", 42, "deepseek-reasoner"], refreshedAt: "now" },
    openai: { models: ["gpt-4.1"] },
    anthropic: { models: "not-an-array" },
    unknown: { models: ["ignored"] }
  });
  assert.deepEqual(catalog.deepseek?.models, ["deepseek-chat", "deepseek-reasoner"]);
  assert.equal(catalog.deepseek?.refreshedAt, "now");
  assert.deepEqual(catalog.openai?.models, ["gpt-4.1"]);
  assert.equal(catalog.anthropic, undefined);
  assert.ok(modelsForProvider(catalog, "deepseek").includes("deepseek-chat"));
  assert.ok(modelsForProvider(catalog, "openai").includes("gpt-4.1-mini"));
});

test("cached provider models are fresh for one hour and can be replaced independently", () => {
  const now = Date.parse("2026-11-02T12:00:00.000Z");
  const catalog = mergeProviderModels(normalizeModelCatalog({
    openai: { models: ["gpt-test"], refreshedAt: new Date(now - 1_000).toISOString() }
  }), "deepseek", ["deepseek-flash", "deepseek-flash", "deepseek-v4-pro"], new Date(now).toISOString());
  assert.equal(isModelCatalogFresh(catalog, "deepseek", now + MODEL_CATALOG_TTL_MS - 1), true);
  assert.equal(isModelCatalogFresh(catalog, "deepseek", now + MODEL_CATALOG_TTL_MS), false);
  assert.deepEqual(catalog.deepseek?.models, ["deepseek-flash", "deepseek-v4-pro"]);
  assert.deepEqual(catalog.openai?.models, ["gpt-test"]);
  assert.equal(isModelCatalogFresh(catalog, "anthropic", now), false);
});

test("provider model discovery uses the provider endpoint and auth header", async () => {
  let requested = "";
  let authorization = "";
  const config = { name: "deepseek" as const, apiKey: "test-key", model: "deepseek-chat" };
  const models = await listProviderModels(config, async (url, init) => {
    requested = String(url);
    authorization = (init?.headers as Record<string, string>).authorization;
    return new Response(JSON.stringify({ data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }, { id: 42 }] }), { status: 200 });
  });
  assert.deepEqual(models, ["deepseek-chat", "deepseek-reasoner"]);
  assert.equal(requested, "https://api.deepseek.com/v1/models");
  assert.equal(authorization, "Bearer test-key");

  const anthropic = await listProviderModels(
    { name: "anthropic", apiKey: "test-key", model: "claude" },
    async (url, init) => {
      assert.equal(String(url), "https://api.anthropic.com/v1/models");
      assert.equal((init?.headers as Record<string, string>)["x-api-key"], "test-key");
      return new Response(JSON.stringify({ data: [{ id: "claude-test" }] }), { status: 200 });
    }
  );
  assert.deepEqual(anthropic, ["claude-test"]);
});

test("reasoning settings become provider-specific request fields", () => {
  const anthropic = buildProviderRequest(
    { name: "anthropic", apiKey: "test", model: "claude", maxTokens: 2048, thinkingBudget: 4096 },
    { system: "s", user: "u" }
  );
  assert.deepEqual(anthropic.body.thinking, { type: "enabled", budget_tokens: 4096 });
  assert.equal(anthropic.body.max_tokens, 5120);

  const openai = buildProviderRequest(
    { name: "openai", apiKey: "test", model: "o3", reasoningEffort: "high" },
    { system: "s", user: "u" }
  );
  assert.equal(openai.body.reasoning_effort, "high");

  const fromEnv = providerFromEnvironment({
    MASTHEAD_PROVIDER: "anthropic",
    MASTHEAD_MODEL: "claude",
    ANTHROPIC_API_KEY: "test",
    MASTHEAD_THINKING_BUDGET: "2048"
  });
  assert.equal(fromEnv.thinkingBudget, 2048);
});

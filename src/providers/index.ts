// Provider adapters stay deliberately small. The review engine owns prompts and
// validation; providers only turn a request into one HTTP response.
export type ProviderName = "anthropic" | "openai" | "deepseek";

export interface ProviderConfig {
  name: ProviderName;
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** OpenAI-compatible reasoning control for models that support it. */
  reasoningEffort?: "low" | "medium" | "high";
  /** Anthropic extended-thinking budget in tokens. */
  thinkingBudget?: number;
  /** Older compatible endpoints may require the legacy max_tokens field. */
  tokenParameter?: "max_tokens" | "max_completion_tokens";
}

export interface ProviderRequest {
  system: string;
  user: string;
}

export interface ProviderResponse {
  text: string;
  model: string;
  rawUsage?: unknown;
}

export interface ProviderHttpRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/**
 * Read only the selected provider key; never enumerate or log credentials.
 * Settings may choose a provider/model, but the key still comes from a
 * pipeline secret and only that provider's variable is read.
 */
export function providerFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  overrides: {
    name?: string;
    model?: string;
    reasoningEffort?: "low" | "medium" | "high";
    thinkingBudget?: number;
  } = {}
): ProviderConfig {
  const name = (overrides.name || env.MASTHEAD_PROVIDER || "").trim().toLowerCase();
  if (name !== "anthropic" && name !== "openai" && name !== "deepseek") {
    throw new Error("Set MASTHEAD_PROVIDER to anthropic, openai or deepseek.");
  }

  const model = (overrides.model || env.MASTHEAD_MODEL || "").trim();
  if (!model) {
    throw new Error("Set MASTHEAD_MODEL to the provider model name.");
  }

  const keyName =
    name === "anthropic"
      ? "ANTHROPIC_API_KEY"
      : name === "openai"
        ? "OPENAI_API_KEY"
        : "DEEPSEEK_API_KEY";
  const apiKey = (env[keyName] || "").trim();
  if (!apiKey) {
    throw new Error(`Set ${keyName} before running a live review.`);
  }

  const reasoningEffort = overrides.reasoningEffort ?? optionalReasoningEffort(env.MASTHEAD_REASONING_EFFORT);
  const thinkingBudget = overrides.thinkingBudget ?? optionalThinkingBudget(env.MASTHEAD_THINKING_BUDGET);
  return {
    name,
    apiKey,
    model,
    baseUrl: (env.MASTHEAD_BASE_URL || "").trim() || undefined,
    maxTokens: positiveNumber(env.MASTHEAD_MAX_TOKENS, 4096),
    temperature: optionalTemperature(env.MASTHEAD_TEMPERATURE),
    timeoutMs: positiveNumber(env.MASTHEAD_TIMEOUT_MS, 60_000),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(thinkingBudget ? { thinkingBudget } : {})
  };
}

/** Fetch the provider's current chat model ids; failures do not block a review. */
export async function listProviderModels(
  config: ProviderConfig,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<string[]> {
  const base = config.name === "anthropic"
    ? safeBaseUrl(config.baseUrl ?? "https://api.anthropic.com")
    : safeBaseUrl(config.baseUrl ?? (config.name === "openai" ? "https://api.openai.com/v1" : "https://api.deepseek.com/v1"));
  const url = config.name === "anthropic" ? `${base}/v1/models` : `${base}/models`;
  const timeout = AbortSignal.timeout(config.timeoutMs ?? 30_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: config.name === "anthropic"
        ? {
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
            accept: "application/json"
          }
        : {
            authorization: `Bearer ${config.apiKey}`,
            accept: "application/json"
          },
      signal: requestSignal,
      redirect: "error"
    });
  } catch {
    throw new Error("Provider model list could not be requested.");
  }
  if (!response.ok) {
    throw new Error(`Provider model list failed with HTTP ${response.status}.`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Provider model list returned invalid JSON.");
  }
  const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  return [...new Set(data
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => typeof item.id === "string" ? item.id.trim() : "")
    .filter((id) => id.length > 0 && id.length <= 200)
  )].slice(0, 200);
}

/** Provider protocols differ even when they serve the same review contract. */
export function buildProviderRequest(
  config: ProviderConfig,
  request: ProviderRequest
): ProviderHttpRequest {
  if (!["anthropic", "openai", "deepseek"].includes(config.name)) {
    throw new Error("Unknown provider.");
  }
  const maxTokens = config.maxTokens ?? 4096;
  if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0 || !config.model.trim() || !config.apiKey.trim()) {
    throw new Error("Invalid provider configuration.");
  }
  if (config.temperature !== undefined && (!Number.isFinite(config.temperature) || config.temperature < 0 || config.temperature > 2)) {
    throw new Error("Invalid provider temperature.");
  }
  if (config.thinkingBudget !== undefined &&
      (!Number.isSafeInteger(config.thinkingBudget) || config.thinkingBudget < 1 || config.thinkingBudget > 100_000)) {
    throw new Error("Invalid thinking budget.");
  }
  const sampling = config.temperature === undefined ? {} : { temperature: config.temperature };

  if (config.name === "anthropic") {
    const thinking = config.thinkingBudget
      ? { thinking: { type: "enabled", budget_tokens: config.thinkingBudget } }
      : {};
    return {
      url: `${safeBaseUrl(config.baseUrl ?? "https://api.anthropic.com")}/v1/messages`,
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: {
        model: config.model,
        // Extended thinking consumes output budget; leave room for the review JSON.
        max_tokens: config.thinkingBudget ? Math.max(maxTokens, config.thinkingBudget + 1024) : maxTokens,
        ...(config.thinkingBudget ? {} : sampling),
        ...thinking,
        system: request.system,
        messages: [{ role: "user", content: request.user }]
      }
    };
  }

  const defaultBase =
    config.name === "openai" ? "https://api.openai.com/v1" : "https://api.deepseek.com/v1";
  return {
    url: `${safeBaseUrl(config.baseUrl ?? defaultBase)}/chat/completions`,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`
    },
    body: {
      model: config.model,
      [config.tokenParameter ?? (config.name === "openai" ? "max_completion_tokens" : "max_tokens")]: maxTokens,
      ...sampling,
      ...(config.name === "openai" && config.reasoningEffort
        ? { reasoning_effort: config.reasoningEffort }
        : {}),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user }
      ]
    }
  };
}

/** Bound the request, honor cancellation, and never expose provider error bodies. */
export async function complete(
  config: ProviderConfig,
  request: ProviderRequest,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ProviderResponse> {
  const httpRequest = buildProviderRequest(config, request);
  const timeoutMs = config.timeoutMs ?? 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("Invalid provider timeout.");
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let payload: unknown;
  try {
    requestSignal.throwIfAborted();
    const response = await fetchImpl(httpRequest.url, {
      method: "POST",
      headers: httpRequest.headers,
      body: JSON.stringify(httpRequest.body),
      signal: requestSignal,
      redirect: "error"
    });
    if (!response.ok) {
      throw new HttpFailure(response.status);
    }
    const body = await response.text();
    if (body.length > 2_000_000) {
      throw new Error("Response too large.");
    }
    payload = JSON.parse(body);
  } catch (error) {
    if (signal?.aborted) {
      throw new Error("Provider request cancelled.");
    }
    if (timeout.aborted) {
      throw new Error("Provider request timed out.");
    }
    if (error instanceof HttpFailure) {
      throw new Error(`Provider request failed with HTTP ${error.status}.`);
    }
    // Network, redirect and JSON errors may contain credentials or prompt fragments.
    throw new Error("Provider request could not be completed.");
  }
  if (signal?.aborted) throw new Error("Provider request cancelled.");
  if (timeout.aborted) throw new Error("Provider request timed out.");
  if (isRecord(payload) && (payload.stop_reason === "max_tokens" ||
      (Array.isArray(payload.choices) && payload.choices.some((choice) => isRecord(choice) && choice.finish_reason === "length")))) {
    throw new Error("Provider response exceeded the output token budget.");
  }
  const text = extractText(config.name, payload);
  if (!text) {
    throw new Error("Provider returned no text content.");
  }

  return {
    text,
    model: config.model,
    rawUsage: isRecord(payload) ? payload.usage : undefined
  };
}

/** Never return tool-call or reasoning blocks as a publishable review body. */
function extractText(name: ProviderName, payload: unknown): string {
  if (!isRecord(payload)) {
    return "";
  }

  if (name === "anthropic") {
    const content = payload.content;
    if (!Array.isArray(content)) {
      return "";
    }
    return content
      .map((item) => (isRecord(item) && item.type === "text" ? String(item.text ?? "") : ""))
      .join("");
  }

  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }
  const first = choices[0];
  if (!isRecord(first) || !isRecord(first.message)) {
    return "";
  }
  return typeof first.message.content === "string" ? first.message.content : "";
}

/** Keep credentials out of URLs and do not send an API key over plaintext remote HTTP. */
function safeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Provider endpoint URL is invalid.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
    throw new Error("Provider endpoints require HTTPS (HTTP is allowed only on loopback).");
  }
  return url.href.replace(/\/+$/, "");
}

/** Invalid limits fail early rather than silently replacing an administrator's policy. */
function positiveNumber(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Provider limits must be positive integers.");
  }
  return parsed;
}

/** Restrict reasoning controls to the provider-supported values. */
function optionalReasoningEffort(value: string | undefined): "low" | "medium" | "high" | undefined {
  const normalized = (value || "").trim().toLowerCase();
  return normalized === "low" || normalized === "medium" || normalized === "high"
    ? normalized
    : undefined;
}

/** Anthropic thinking budgets are token counts; reject arbitrary strings. */
function optionalThinkingBudget(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100_000) {
    throw new Error("MASTHEAD_THINKING_BUDGET must be a positive integer.");
  }
  return parsed;
}

/** Omitting temperature supports models that reject a non-default sampling parameter. */
function optionalTemperature(value: string | undefined): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    throw new Error("Provider temperature must be between zero and two.");
  }
  return parsed;
}

/** Validate response records before reading provider-specific fields. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Carry an HTTP status internally without retaining its potentially private body. */
class HttpFailure extends Error {
  constructor(readonly status: number) {
    super("Provider HTTP failure.");
  }
}

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

export function providerFromEnvironment(
  env: NodeJS.ProcessEnv = process.env
): ProviderConfig {
  const name = (env.MASTHEAD_PROVIDER || "").trim().toLowerCase();
  if (name !== "anthropic" && name !== "openai" && name !== "deepseek") {
    throw new Error("Set MASTHEAD_PROVIDER to anthropic, openai or deepseek.");
  }

  const model = (env.MASTHEAD_MODEL || "").trim();
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

  return {
    name,
    apiKey,
    model,
    baseUrl: (env.MASTHEAD_BASE_URL || "").trim() || undefined,
    maxTokens: positiveNumber(env.MASTHEAD_MAX_TOKENS, 4096),
    temperature: nonNegativeNumber(env.MASTHEAD_TEMPERATURE, 0.2)
  };
}

export function buildProviderRequest(
  config: ProviderConfig,
  request: ProviderRequest
): ProviderHttpRequest {
  const maxTokens = config.maxTokens ?? 4096;
  const temperature = config.temperature ?? 0.2;

  if (config.name === "anthropic") {
    return {
      url: `${trimSlash(config.baseUrl ?? "https://api.anthropic.com")}/v1/messages`,
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: {
        model: config.model,
        max_tokens: maxTokens,
        temperature,
        system: request.system,
        messages: [{ role: "user", content: request.user }]
      }
    };
  }

  const defaultBase =
    config.name === "openai" ? "https://api.openai.com/v1" : "https://api.deepseek.com/v1";
  return {
    url: `${trimSlash(config.baseUrl ?? defaultBase)}/chat/completions`,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`
    },
    body: {
      model: config.model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user }
      ]
    }
  };
}

export async function complete(
  config: ProviderConfig,
  request: ProviderRequest,
  fetchImpl: typeof fetch = fetch
): Promise<ProviderResponse> {
  const httpRequest = buildProviderRequest(config, request);
  const response = await fetchImpl(httpRequest.url, {
    method: "POST",
    headers: httpRequest.headers,
    body: JSON.stringify(httpRequest.body)
  });

  if (!response.ok) {
    // Do not include the response body: provider errors can echo prompts or keys.
    throw new Error(`Provider request failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as unknown;
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

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

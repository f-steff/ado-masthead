// Project service-hook helpers. Creating a subscription is an explicit setup
// action: the extension never provisions service connections, pipeline YAML or
// broker hosting, and it never stores the broker secret used for Basic auth.
export const SERVICE_HOOK_EVENTS = [
  "git.pullrequest.created",
  "git.pullrequest.updated",
  "ms.vss-code.git-pullrequest-comment-event"
] as const;

export type ServiceHookEvent = (typeof SERVICE_HOOK_EVENTS)[number];

export interface ServiceHookEndpoint {
  url: string;
  /** Broker Basic-auth value. It lives only in the current browser request. */
  basicAuthCredentials?: string;
}

export interface ServiceHookSubscriptionInput {
  projectId: string;
  eventType: ServiceHookEvent;
  endpoint: ServiceHookEndpoint;
}

/** Build the public incoming-webhook URL from the organization URL and name. */
export function nativeServiceHookUrl(organizationUrl: string, webhookName: string): string {
  const name = webhookName.trim();
  if (!name || name.length > 160 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error("The native webhook name is invalid.");
  }
  const base = validatedEndpoint(organizationUrl, "organization URL");
  return `${base.replace(/\/+$/, "")}/_apis/public/distributedtask/webhooks/${encodeURIComponent(name)}` +
    "?api-version=6.0-preview";
}

/** Build the broker endpoint. A base URL or an existing /event URL is accepted. */
export function brokerServiceHookUrl(brokerUrl: string): string {
  const url = validatedEndpoint(brokerUrl, "broker URL");
  const path = new URL(url).pathname.replace(/\/+$/, "");
  return `${url.replace(/\/+$/, "")}${path.endsWith("/event") ? "" : "/event"}`;
}

/** Build the Basic-auth value expected by the Masthead broker. */
export function brokerBasicAuth(secret: string): string {
  if (secret.length < 32 || /[\r\n]/.test(secret)) {
    throw new Error("The broker secret must be at least 32 characters on one line.");
  }
  return `masthead:${secret}`;
}

/**
 * Build a webhook subscription for one project. The event type and project are
 * fixed data; no webhook payload or event-supplied URL can influence this body.
 */
export function buildServiceHookSubscription(
  input: ServiceHookSubscriptionInput
): Record<string, unknown> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.projectId)) {
    throw new Error("A valid project id is required.");
  }
  if (!SERVICE_HOOK_EVENTS.includes(input.eventType)) {
    throw new Error("Unsupported service-hook event.");
  }
  const endpoint = validatedEndpoint(input.endpoint.url, "service-hook URL");
  const consumerInputs: Record<string, string> = { url: endpoint };
  if (input.endpoint.basicAuthCredentials) {
    if (/[\r\n]/.test(input.endpoint.basicAuthCredentials)) {
      throw new Error("Service-hook credentials must be on one line.");
    }
    consumerInputs.basicAuthCredentials = input.endpoint.basicAuthCredentials;
  }
  return {
    publisherId: "tfs",
    eventType: input.eventType,
    resourceVersion: "1.0",
    consumerId: "webHooks",
    consumerActionId: "httpRequest",
    publisherInputs: {
      projectId: input.projectId,
      repository: "",
      branch: ""
    },
    consumerInputs
  };
}

/** Match only subscriptions for the current endpoint and project. */
export function isMastheadServiceHook(
  value: unknown,
  projectId: string,
  endpointUrl: string
): boolean {
  if (!isRecord(value) || value.consumerId !== "webHooks" || value.consumerActionId !== "httpRequest") {
    return false;
  }
  if (!SERVICE_HOOK_EVENTS.includes(value.eventType as ServiceHookEvent)) return false;
  const consumer = isRecord(value.consumerInputs) ? value.consumerInputs : undefined;
  const publisher = isRecord(value.publisherInputs) ? value.publisherInputs : undefined;
  return consumer?.url === endpointUrl && publisher?.projectId === projectId;
}

/** Require HTTPS, or HTTP only on loopback, with no embedded credentials. */
function validatedEndpoint(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`The ${label} is invalid.`);
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error(`The ${label} must use HTTPS (or HTTP on loopback) without credentials, a query or a fragment.`);
  }
  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Pure broker helpers are kept separate so their authentication and event
// selection can be tested without starting a container or calling Azure DevOps.
import { timingSafeEqual } from "node:crypto";

export const SUPPORTED_EVENTS = new Set([
  "git.pullrequest.created",
  "git.pullrequest.updated",
  "ms.vss-code.git-pullrequest-comment-event"
]);

/**
 * Accepts either the explicit Masthead header or Basic auth. Basic auth is
 * preferred for ADO subscriptions because the credential is not placed in a
 * URL or template expression.
 */
export function isAuthorized(headers, secret) {
  if (!secret) {
    return false;
  }

  const explicit = headerValue(headers, "x-masthead-secret");
  if (explicit && safeEqual(explicit, secret)) {
    return true;
  }

  const authorization = headerValue(headers, "authorization");
  if (!authorization.startsWith("Basic ")) {
    return false;
  }

  const decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  return separator >= 0 && safeEqual(decoded.slice(separator + 1), secret);
}

/** Extracts the supported PR event and its stable delivery key. */
export function parseEvent(body, maxBytes = 1024 * 1024) {
  if (Buffer.byteLength(body, "utf8") > maxBytes) {
    throw new Error("Webhook body is too large.");
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("Webhook body is not valid JSON.");
  }

  if (!payload || typeof payload !== "object" || !SUPPORTED_EVENTS.has(payload.eventType)) {
    throw new Error("Unsupported webhook event.");
  }

  const notificationId = payload.notificationId ?? payload.id;
  if (notificationId === undefined || notificationId === null) {
    throw new Error("Webhook event has no delivery identifier.");
  }

  return {
    payload,
    eventType: payload.eventType,
    deliveryKey: `${payload.eventType}:${String(notificationId)}`
  };
}

/** Builds the small parameter set the central pipeline needs to resolve the PR. */
export function buildQueueBody(event, pipelineId) {
  const payload = event.payload;
  const resource = payload.resource && typeof payload.resource === "object" ? payload.resource : {};
  const repository = resource.repository && typeof resource.repository === "object" ? resource.repository : {};
  const project = resource.project && typeof resource.project === "object" ? resource.project : {};

  return {
    definition: { id: Number(pipelineId) },
    parameters: JSON.stringify({
      mastheadEventType: event.eventType,
      mastheadDeliveryKey: event.deliveryKey,
      mastheadProjectId: String(project.id ?? ""),
      mastheadRepositoryId: String(repository.id ?? ""),
      mastheadPullRequestId: String(resource.pullRequestId ?? ""),
      mastheadSourceCommit: String(resource.lastMergeSourceCommit?.commitId ?? ""),
      mastheadTargetCommit: String(resource.lastMergeTargetCommit?.commitId ?? "")
    })
  };
}

export function queueUrl(org, project, apiVersion = "7.1") {
  return `${org.replace(/\/+$/, "")}/${encodeURIComponent(project)}/_apis/build/builds?api-version=${apiVersion}`;
}

function headerValue(headers, name) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return typeof value === "string" ? value : "";
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

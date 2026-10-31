// Shared protocol handling for native and broker delivery. Normalize identifiers
// only; never execute or forward event-supplied URLs, titles or shell text.
import { timingSafeEqual } from "node:crypto";

export const SUPPORTED_EVENTS = new Set([
  "git.pullrequest.created",
  "git.pullrequest.updated",
  "ms.vss-code.git-pullrequest-comment-event"
]);

/** ADO Web Hooks can send Basic authentication or a static custom header over TLS. */
export function isAuthorized(headers, secret) {
  if (!secret) return false;
  const explicit = headerValue(headers, "x-masthead-secret");
  if (explicit && safeEqual(explicit, secret)) return true;
  const authorization = headerValue(headers, "authorization");
  if (!/^Basic /i.test(authorization)) return false;
  const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  return separator >= 0 && safeEqual(decoded.slice(separator + 1), secret);
}

/** Bound the transport payload before parsing its untrusted JSON. */
export function parseEvent(body, maxBytes = 1024 * 1024) {
  if (Buffer.byteLength(body, "utf8") > maxBytes) throw new Error("Webhook body is too large.");
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("Webhook body is not valid JSON.");
  }
  return normalizeEvent(payload);
}

/** PR comment events nest their PR under resource.pullRequest (resource version 2.0). */
export function normalizeEvent(payload) {
  if (!record(payload) || !SUPPORTED_EVENTS.has(payload.eventType)) {
    throw new Error("Unsupported webhook event.");
  }
  const resource = record(payload.resource) ? payload.resource : {};
  const isComment = payload.eventType === "ms.vss-code.git-pullrequest-comment-event";
  const pr = isComment ? resource.pullRequest : resource;
  if (!record(pr) || !record(pr.repository)) throw new Error("Webhook event has no pull request.");
  const repository = pr.repository;
  const projectId = identifier(repository.project?.id ?? payload.resourceContainers?.project?.id);
  const repositoryId = identifier(repository.id);
  const pullRequestId = positiveId(pr.pullRequestId);

  // notificationId is scoped to its subscription and can repeat in other subscriptions.
  const deliveryId = payload.id ?? (payload.subscriptionId && payload.notificationId !== undefined
    ? `${identifier(payload.subscriptionId)}:${positiveId(payload.notificationId)}` : undefined);
  if (typeof deliveryId !== "string" || !/^[A-Za-z0-9:_-]{1,200}$/.test(deliveryId)) {
    throw new Error("Webhook event has no valid delivery identifier.");
  }
  let comment;
  if (isComment) {
    if (!record(resource.comment)) throw new Error("Webhook event has no comment.");
    const value = resource.comment;
    const selfPath = typeof value._links?.self?.href === "string" ? value._links.self.href : "";
    // Read a thread ID from the path only. Never fetch this potentially forged URL.
    const thread = /\/threads\/(\d+)\/comments\/\d+(?:[?#].*)?$/.exec(selfPath);
    comment = {
      id: positiveId(value.id),
      threadId: positiveId(resource.thread?.id ?? (thread ? Number(thread[1]) : undefined)),
      authorId: identifier(value.author?.id),
      revision: commentRevision(value.lastContentUpdatedDate ?? value.lastUpdatedDate ?? value.publishedDate)
    };
  }
  return {
    eventType: payload.eventType,
    deliveryKey: `${payload.eventType}:${deliveryId}`,
    projectId,
    repositoryId,
    pullRequestId,
    sourceCommit: commitId(pr.lastMergeSourceCommit?.commitId),
    targetCommit: commitId(pr.lastMergeTargetCommit?.commitId),
    status: typeof pr.status === "string" ? pr.status : "",
    ...(comment ? { comment } : {})
  };
}

/** Queue a fixed definition with identifiers; webhook data never selects executable YAML. */
export function buildQueueBody(event, pipelineId) {
  return {
    definition: { id: positiveId(pipelineId) },
    templateParameters: {
      mastheadEventType: event.eventType,
      mastheadDeliveryKey: event.deliveryKey,
      mastheadProjectId: event.projectId,
      mastheadRepositoryId: event.repositoryId,
      mastheadPullRequestId: String(event.pullRequestId),
      mastheadSourceCommit: event.sourceCommit,
      mastheadTargetCommit: event.targetCommit,
      mastheadThreadId: String(event.comment?.threadId ?? ""),
      mastheadCommentId: String(event.comment?.id ?? ""),
      mastheadCommentRevision: event.comment?.revision ?? ""
    }
  };
}

/** Use only the configured organization endpoint, not a callback URL in an event. */
export function queueUrl(org, project, apiVersion = "7.1") {
  const url = new URL(org);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.search || url.hash || !project.trim()) {
    throw new Error("Invalid Azure DevOps endpoint configuration.");
  }
  return `${url.href.replace(/\/+$/, "")}/${encodeURIComponent(project)}/_apis/build/builds?api-version=${apiVersion}`;
}

/** Accept opaque ADO IDs, never path fragments or executable text. */
function identifier(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) {
    throw new Error("Webhook event has an invalid resource identifier.");
  }
  return value;
}

/** PR, thread, comment and pipeline IDs are strictly positive decimal integers. */
function positiveId(value) {
  const parsed = Number(value);
  if (!["string", "number"].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) ||
      !Number.isSafeInteger(parsed)) throw new Error("Expected a positive resource ID.");
  return parsed;
}

/** Missing revisions are resolved later through ADO; malformed revisions are rejected. */
function commitId(value) {
  if (value === undefined) return "";
  if (typeof value !== "string" || !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(value)) {
    throw new Error("Webhook event has an invalid commit ID.");
  }
  return value;
}

/** Only a timestamp may enter the pipeline's comment-revision parameter. */
function commentRevision(value) {
  if (value === undefined) return "";
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error("Webhook event has an invalid comment revision.");
  }
  return value;
}

/** Reject arrays and null before extracting protocol fields. */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** HTTP field names are case-insensitive, including in deterministic unit fixtures. */
function headerValue(headers, name) {
  const entry = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return entry && typeof entry[1] === "string" ? entry[1] : "";
}

/** Compare without timing leaks after checking the encoded lengths. */
function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

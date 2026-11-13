// Event envelope parsing for the central pipeline. The broker and native
// pipeline pass only identifiers; this module rejects unknown event types and
// malformed IDs before any ADO request or model call.
export type MastheadEventType =
  | "manual"
  | "git.pullrequest.created"
  | "git.pullrequest.updated"
  | "ms.vss-code.git-pullrequest-comment-event";

export interface EventEnvelope {
  eventType: MastheadEventType;
  deliveryKey?: string;
  threadId?: number;
  commentId?: number;
  commentRevision?: string;
}

const COMMENT_EVENT: MastheadEventType = "ms.vss-code.git-pullrequest-comment-event";
const REVIEW_EVENTS: ReadonlySet<MastheadEventType> = new Set([
  "manual",
  "git.pullrequest.created",
  "git.pullrequest.updated"
]);
const EVENT_TYPES: ReadonlySet<string> = new Set([...REVIEW_EVENTS, COMMENT_EVENT]);

export function isCommentEvent(eventType: MastheadEventType): boolean {
  return eventType === COMMENT_EVENT;
}

export function isReviewEvent(eventType: MastheadEventType): boolean {
  return REVIEW_EVENTS.has(eventType);
}

export function parseEventEnvelope(env: NodeJS.ProcessEnv): EventEnvelope {
  const rawEventType = (env.MASTHEAD_EVENT_TYPE || "manual").trim();
  if (!EVENT_TYPES.has(rawEventType)) {
    throw new Error("Unsupported MASTHEAD_EVENT_TYPE.");
  }
  const eventType = rawEventType as MastheadEventType;
  const deliveryKey = optionalIdentifier(env.MASTHEAD_DELIVERY_KEY);
  if (eventType === COMMENT_EVENT) {
    const threadId = positive(env.MASTHEAD_THREAD_ID, "MASTHEAD_THREAD_ID");
    const commentId = positive(env.MASTHEAD_COMMENT_ID, "MASTHEAD_COMMENT_ID");
    return {
      eventType,
      ...(deliveryKey ? { deliveryKey } : {}),
      threadId,
      commentId,
      ...(commentRevision(env.MASTHEAD_COMMENT_REVISION) ? { commentRevision: commentRevision(env.MASTHEAD_COMMENT_REVISION) } : {})
    };
  }
  return { eventType, ...(deliveryKey ? { deliveryKey } : {}) };
}

function optionalIdentifier(value: string | undefined): string | undefined {
  const trimmed = (value || "").trim();
  if (!trimmed) return undefined;
  if (!/^[A-Za-z0-9:._-]{1,200}$/.test(trimmed)) throw new Error("MASTHEAD_DELIVERY_KEY is invalid.");
  return trimmed;
}

function positive(value: string | undefined, name: string): number {
  const trimmed = (value || "").trim();
  if (!/^[1-9]\d*$/.test(trimmed)) throw new Error(`${name} must be a positive integer.`);
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} is out of range.`);
  return parsed;
}

function commentRevision(value: string | undefined): string | undefined {
  const trimmed = (value || "").trim();
  if (!trimmed) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(trimmed) || !Number.isFinite(Date.parse(trimmed))) {
    throw new Error("MASTHEAD_COMMENT_REVISION is invalid.");
  }
  return trimmed;
}

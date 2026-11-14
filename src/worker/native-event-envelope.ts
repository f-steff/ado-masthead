// Convert a normalized ADO service-hook event into the environment contract
// used by the review and reply jobs. The event supplies identifiers only.
import { normalizeEvent } from "../../broker/lib.mjs";
import type { NormalizedPrEvent } from "../../broker/lib.mjs";
import { EventEnvelope, isCommentEvent, isReviewEvent } from "./event-envelope";

export interface NativeEventEnvironment {
  env: NodeJS.ProcessEnv;
  envelope: EventEnvelope;
}

/**
 * Native payload dates can be reformatted by the pipeline's JSON conversion.
 * Drop them before normalization; the worker re-fetches the thread comment and
 * uses its trusted timestamp as the reply revision.
 */
export function normalizeNativeEvent(payload: unknown): NormalizedPrEvent {
  if (isRecord(payload) && isRecord(payload.resource) && isRecord(payload.resource.comment)) {
    const comment = { ...payload.resource.comment };
    delete comment.lastContentUpdatedDate;
    delete comment.lastUpdatedDate;
    delete comment.publishedDate;
    return normalizeEvent({
      ...payload,
      resource: { ...payload.resource, comment }
    });
  }
  return normalizeEvent(payload);
}

export function nativeEventEnvironment(
  base: NodeJS.ProcessEnv,
  event: NormalizedPrEvent
): NativeEventEnvironment {
  if (!isCommentEvent(event.eventType as EventEnvelope["eventType"]) &&
      !isReviewEvent(event.eventType as EventEnvelope["eventType"])) {
    throw new Error("Unsupported native webhook event.");
  }
  const envelope: EventEnvelope = {
    eventType: event.eventType as EventEnvelope["eventType"],
    deliveryKey: event.deliveryKey,
    ...(event.comment
      ? {
          threadId: event.comment.threadId,
          commentId: event.comment.id,
          ...(event.comment.revision ? { commentRevision: event.comment.revision } : {})
        }
      : {})
  };
  return {
    envelope,
    env: {
      ...base,
      MASTHEAD_PROJECT: event.projectId,
      MASTHEAD_REPOSITORY: event.repositoryId,
      MASTHEAD_PULL_REQUEST_ID: String(event.pullRequestId),
      MASTHEAD_EVENT_TYPE: event.eventType,
      MASTHEAD_DELIVERY_KEY: event.deliveryKey,
      ...(event.comment
        ? {
            MASTHEAD_THREAD_ID: String(event.comment.threadId),
            MASTHEAD_COMMENT_ID: String(event.comment.id),
            MASTHEAD_COMMENT_REVISION: event.comment.revision
          }
        : {})
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

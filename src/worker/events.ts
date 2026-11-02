// Decisions use re-fetched ADO state, not author/status claims in an unsigned webhook.
import { NormalizedPrEvent, SUPPORTED_EVENTS } from "../../broker/lib.mjs";
import { isRepositoryEnabled, ProjectSettings } from "../settings";
import { ReviewRevision, sameRevision } from "../review/lifecycle";

export interface EventContext {
  projectId: string;
  repositoryId: string;
  pullRequestId: number;
  status: string;
  authorId: string;
  botId: string;
  revision: ReviewRevision;
  lastReviewed?: ReviewRevision;
  /** An adapter must fetch the comment and thread from the fixed, trusted ADO origin. */
  comment?: {
    id: number;
    threadId: number;
    authorId: string;
    threadOwnerId: string;
    explicitMention: boolean;
    revision: string;
    lastAnsweredRevision?: string;
  };
}

export type EventDecision = { operation: "ignore" | "review" | "reply"; reason: string };

/** Reject disabled repositories and feedback loops before making a paid model call. */
export function decideEvent(event: NormalizedPrEvent, project: ProjectSettings, context: EventContext): EventDecision {
  if (!SUPPORTED_EVENTS.has(event.eventType) || !context.botId) return { operation: "ignore", reason: "event or bot identity unavailable" };
  if (event.projectId !== context.projectId || event.repositoryId !== context.repositoryId ||
      event.pullRequestId !== context.pullRequestId) return { operation: "ignore", reason: "resource mismatch" };
  if (!isRepositoryEnabled(project, context.repositoryId)) return { operation: "ignore", reason: "repository disabled" };
  if (context.status !== "active") return { operation: "ignore", reason: "PR is not active" };
  if (event.comment) {
    const comment = context.comment;
    if (!comment || comment.id !== event.comment.id || comment.threadId !== event.comment.threadId) {
      return { operation: "ignore", reason: "comment mismatch" };
    }
    if (comment.authorId === context.botId) return { operation: "ignore", reason: "own comment" };
    if (!comment.revision || comment.revision === comment.lastAnsweredRevision) {
      return { operation: "ignore", reason: "comment already answered or unversioned" };
    }
    const authorReply = comment.authorId === context.authorId && comment.threadOwnerId === context.botId;
    return authorReply || comment.explicitMention
      ? { operation: "reply", reason: "author reply or explicit mention" }
      : { operation: "ignore", reason: "unrelated human conversation" };
  }
  if (context.lastReviewed && sameRevision(context.revision, context.lastReviewed)) {
    return { operation: "ignore", reason: "revision already reviewed" };
  }
  return { operation: "review", reason: "new PR revision" };
}

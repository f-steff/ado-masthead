// Applies a side-effect-free reconciliation plan to Azure DevOps. Every action
// re-fetches the PR revision and verifies bot ownership before writing. The
// publisher never resolves human threads and never reopens a closed finding.
import { AdoClientLike } from "./client";
import {
  decodeFindingMetadata,
  FindingThreadMetadata,
  renderFindingComment,
  renderResolutionComment,
  storedFindingsFromThreads
} from "./metadata";
import { AdoThread, AdoThreadStatus } from "./types";
import { ReconciliationPlan, ReviewRevision, sameRevision } from "../review/lifecycle";

export interface PublishReviewOptions {
  pullRequestId: number;
  revision: ReviewRevision;
  botId: string;
  plan: ReconciliationPlan;
}

export interface PublishReviewResult {
  created: Array<{ findingId: string; threadId: number }>;
  resolved: Array<{ findingId: string; threadId: number }>;
  withdrawn: Array<{ findingId: string; threadId: number }>;
  skipped: Array<{ findingId: string; reason: string }>;
}

/**
 * Publish only actions whose preconditions still hold. A stale plan is a failed
 * publication, not a reason to post against a newer revision.
 */
export async function publishReviewPlan(
  client: AdoClientLike,
  options: PublishReviewOptions
): Promise<PublishReviewResult> {
  if (!options.botId) throw new Error("Masthead identity is required.");
  if (options.plan.stale) throw new Error("Cannot publish a superseded review plan.");
  const pr = await client.getPullRequest(options.pullRequestId);
  const current: ReviewRevision = {
    source: pr.lastMergeSourceCommit.commitId,
    target: pr.lastMergeTargetCommit.commitId
  };
  if (!sameRevision(current, options.revision)) {
    throw new Error("Review revision is no longer current.");
  }

  const threads = await client.listThreads(options.pullRequestId);
  const stored = storedFindingsFromThreads(threads, options.botId);
  const publishedIds = new Set(stored.map((item) => item.finding.id));
  const result: PublishReviewResult = { created: [], resolved: [], withdrawn: [], skipped: [] };
  const threadById = new Map(threads.map((thread) => [thread.id, thread]));

  // Close verified findings first so the publication order cannot create a
  // contradictory open thread for a finding that is already known to be fixed.
  for (const action of options.plan.actions) {
    if (action.kind === "add") continue;
    const thread = threadById.get(action.threadId);
    const metadata = thread ? latestBotMetadata(thread, options.botId) : undefined;
    if (!thread || !metadata) {
      throw new Error("The finding thread is no longer available.");
    }
    if (metadata.finding.id !== action.findingId) {
      throw new Error("The finding thread does not match the planned action.");
    }
    if (!["active", "pending", "unknown"].includes(thread.status) || metadata.state !== "active") {
      result.skipped.push({ findingId: action.findingId, reason: "thread is already closed" });
      continue;
    }
    if (!action.reason.trim()) throw new Error("A resolution reason is required.");
    const nextState = action.kind === "resolve" ? "bot-fixed" : "bot-withdrawn";
    const resolution: FindingThreadMetadata = {
      ...metadata,
      revision: current,
      state: nextState
    };
    const parentCommentId = thread.comments.find((comment) => comment.parentCommentId === 0)?.id ?? 0;
    await client.addThreadComment(
      options.pullRequestId,
      thread.id,
      renderResolutionComment(resolution, action.reason),
      parentCommentId
    );
    await client.updateThreadStatus(
      options.pullRequestId,
      thread.id,
      action.kind === "resolve" ? "fixed" : "wontFix"
    );
    result[action.kind === "resolve" ? "resolved" : "withdrawn"].push({
      findingId: action.findingId,
      threadId: thread.id
    });
  }

  for (const action of options.plan.actions) {
    if (action.kind !== "add") continue;
    if (publishedIds.has(action.finding.id)) {
      result.skipped.push({ findingId: action.finding.id, reason: "finding already has a thread" });
      continue;
    }
    const metadata: FindingThreadMetadata = {
      version: 1,
      kind: "finding",
      finding: action.finding,
      ownerId: options.botId,
      revision: current,
      state: "active"
    };
    const created = await client.createThread(options.pullRequestId, {
      content: renderFindingComment(metadata),
      ...(action.finding.scope === "repository" ? {} : { filePath: `/${action.finding.file}` }),
      ...(action.finding.line === undefined ? {} : { line: action.finding.line })
    });
    result.created.push({ findingId: action.finding.id, threadId: created.id });
    publishedIds.add(action.finding.id);
  }

  return result;
}

/** Find the most recent bot-authored marker in a thread. */
export function latestBotMetadata(thread: AdoThread, botId: string): FindingThreadMetadata | undefined {
  const comments = thread.comments
    .filter((comment) => comment.author?.id === botId && typeof comment.content === "string")
    .sort((left, right) => left.id - right.id);
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const metadata = decodeFindingMetadata(comments[index].content ?? "");
    if (metadata && metadata.ownerId === botId) return metadata;
  }
  return undefined;
}

/** Keep a status switch explicit for callers that display publication results. */
export function statusForAction(kind: "resolve" | "withdraw"): AdoThreadStatus {
  return kind === "resolve" ? "fixed" : "wontFix";
}

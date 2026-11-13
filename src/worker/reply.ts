// Reply-only path for comment events. It answers a human comment on a
// Masthead-owned finding thread and cannot resolve threads or change settings.
import type { NormalizedPrEvent } from "../../broker/lib.mjs";
import { AdoReviewClient } from "../ado/client";
import { latestBotMetadata } from "../ado/publisher";
import { AdoComment, AdoThread } from "../ado/types";
import { complete, providerFromEnvironment } from "../providers";
import { relatedFileCandidates } from "../review/related-files";
import { ReviewInput } from "../review/types";
import { reviewSelection } from "../settings";
import { runConversation } from "./conversation";
import { decideEvent } from "./events";
import { EventEnvelope } from "./event-envelope";
import { createJobContext } from "./job-context";
import { ReviewModel } from "./review";
import { loadReviewSettings, reviewGate } from "./settings";

export type CommentAuthor = "author" | "reviewer" | "masthead";

export function classifyComment(
  comment: AdoComment,
  botId: string,
  pullRequestAuthorId: string
): CommentAuthor {
  if (comment.author?.id === botId) return "masthead";
  if (comment.author?.id && comment.author.id === pullRequestAuthorId) return "author";
  return "reviewer";
}

/** A bot reply parented to the selected comment proves the question was answered. */
export function hasBotReply(thread: AdoThread, commentId: number, botId: string): boolean {
  return thread.comments.some((comment) =>
    comment.author?.id === botId && comment.parentCommentId === commentId
  );
}

export async function runReplyJob(env: NodeJS.ProcessEnv, envelope: EventEnvelope): Promise<void> {
  const { organizationUrl, pullRequestId, auth, client } = createJobContext(env);
  const pr = await client.getPullRequest(pullRequestId);
  const destinationProjectId = pr.repository.project?.id || (env.MASTHEAD_PROJECT_ID || "").trim();
  if (!destinationProjectId || !pr.repository.id) {
    throw new Error("Azure DevOps did not return the pull request's destination project and repository.");
  }
  const snapshot = (env.MASTHEAD_SETTINGS_JSON || "").trim();
  const extensionId = (env.MASTHEAD_EXTENSION_ID || "").trim();
  const settings = await loadReviewSettings({
    organizationUrl,
    token: auth.token,
    tokenScheme: auth.scheme,
    publisher: (env.MASTHEAD_EXTENSION_PUBLISHER || "f-steff").trim(),
    ...(extensionId ? { extensionId } : {}),
    projectId: destinationProjectId,
    repositoryId: pr.repository.id,
    ...(snapshot ? { snapshot } : {})
  });
  if (!reviewGate(settings)) {
    console.log(JSON.stringify({ skipped: "review-disabled", pullRequestId }, null, 2));
    return;
  }

  const threadId = envelope.threadId;
  const commentId = envelope.commentId;
  if (!threadId || !commentId) throw new Error("Comment event is missing thread or comment IDs.");
  const threads = await client.listThreads(pullRequestId);
  const thread = threads.find((item) => item.id === threadId);
  if (!thread) {
    console.log(JSON.stringify({ skipped: "thread-not-found", pullRequestId, threadId }, null, 2));
    return;
  }
  const selected = thread.comments.find((comment) => comment.id === commentId);
  if (!selected || !selected.author?.id || typeof selected.content !== "string") {
    console.log(JSON.stringify({ skipped: "comment-not-found", pullRequestId, threadId, commentId }, null, 2));
    return;
  }
  const identity = await client.getAuthenticatedIdentity();
  if (selected.author.id === identity.id) {
    console.log(JSON.stringify({ skipped: "own-comment", pullRequestId, threadId, commentId }, null, 2));
    return;
  }
  if (hasBotReply(thread, commentId, identity.id)) {
    console.log(JSON.stringify({ skipped: "already-answered", pullRequestId, threadId, commentId }, null, 2));
    return;
  }
  const finding = latestBotMetadata(thread, identity.id);
  if (!finding) {
    console.log(JSON.stringify({ skipped: "not-a-masthead-thread", pullRequestId, threadId }, null, 2));
    return;
  }

  const prAuthorId = pr.createdBy?.id || "";
  const explicitMention = /@masthead\b/i.test(selected.content);
  const revision = envelope.commentRevision || selected.lastUpdatedDate || selected.publishedDate || "";
  const event: NormalizedPrEvent = {
    eventType: envelope.eventType,
    deliveryKey: envelope.deliveryKey ?? `comment:${pullRequestId}:${threadId}:${commentId}`,
    projectId: destinationProjectId,
    repositoryId: pr.repository.id,
    pullRequestId,
    sourceCommit: pr.lastMergeSourceCommit.commitId,
    targetCommit: pr.lastMergeTargetCommit.commitId,
    status: pr.status,
    comment: {
      id: commentId,
      threadId,
      authorId: selected.author.id,
      revision
    }
  };
  const decision = decideEvent(event, settings.project, {
    projectId: destinationProjectId,
    repositoryId: pr.repository.id,
    pullRequestId,
    status: pr.status,
    authorId: prAuthorId,
    botId: identity.id,
    revision: {
      source: pr.lastMergeSourceCommit.commitId,
      target: pr.lastMergeTargetCommit.commitId
    },
    comment: {
      id: commentId,
      threadId,
      authorId: selected.author.id,
      threadOwnerId: finding.ownerId,
      explicitMention,
      revision
    }
  });
  if (decision.operation !== "reply") {
    console.log(JSON.stringify({ skipped: decision.reason, pullRequestId, threadId, commentId }, null, 2));
    return;
  }

  const context = await readConversationContext(client, pullRequestId, pr.lastMergeSourceCommit.commitId);
  const input: ReviewInput = {
    title: pr.title,
    description: pr.description,
    changedFiles: context.changedFiles,
    ...(context.relatedFiles.length === 0 ? {} : { relatedFiles: context.relatedFiles })
  };
  const selection = reviewSelection(settings.organization, settings.project, settings.repositoryId);
  const provider = providerFromEnvironment(env, selection);
  const model: ReviewModel = (request, signal) => complete(provider, request, fetch, signal);
  const conversation = await runConversation({
    finding: finding.finding,
    review: input,
    comments: thread.comments.map((comment) => ({
      id: comment.id,
      author: classifyComment(comment, identity.id, prAuthorId),
      body: typeof comment.content === "string" ? comment.content : ""
    })),
    replyToCommentId: commentId
  }, model);
  await client.addThreadComment(pullRequestId, threadId, renderReply(conversation.answer), commentId);
  console.log(JSON.stringify({
    replied: true,
    pullRequestId,
    threadId,
    commentId,
    needsRecheck: conversation.needsRecheck,
    provider: provider.name,
    model: provider.model
  }, null, 2));
}

/** Keep model output from injecting raw HTML into an ADO comment. */
export function renderReply(answer: string): string {
  return answer.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function readConversationContext(
  client: AdoReviewClient,
  pullRequestId: number,
  sourceCommit: string
): Promise<{ changedFiles: ReviewInput["changedFiles"]; relatedFiles: Array<{ path: string; content: string }> }> {
  const changes = await client.listPullRequestChanges(pullRequestId);
  const changedFiles: ReviewInput["changedFiles"] = [];
  let totalCharacters = 0;
  for (const change of changes.slice(0, 20)) {
    if (change.changeType === "delete") {
      changedFiles.push({ path: change.path, changeType: "delete" });
      continue;
    }
    const content = await client.getItemContent(sourceCommit, change.path);
    if (content === null || content.includes("\u0000") || content.length > 120_000) continue;
    if (totalCharacters + content.length > 240_000) continue;
    changedFiles.push({ path: change.path, changeType: change.changeType, content });
    totalCharacters += content.length;
  }
  const relatedFiles: Array<{ path: string; content: string }> = [];
  for (const path of relatedFileCandidates(changedFiles).slice(0, 8)) {
    if (relatedFiles.length >= 6) break;
    const content = await client.getItemContent(sourceCommit, path);
    if (content === null || content.includes("\u0000") || content.length > 80_000) continue;
    if (totalCharacters + content.length > 300_000) continue;
    relatedFiles.push({ path, content });
    totalCharacters += content.length;
  }
  return { changedFiles, relatedFiles };
}

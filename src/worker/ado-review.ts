// Orchestrates one ADO pull request through the validated review engine and the
// publisher. This is deliberately a single-run operation: event deduplication,
// settings lookup and service-hook deployment belong to the surrounding worker.
import { AdoReviewClient } from "../ado/client";
import { storedFindingsFromThreads } from "../ado/metadata";
import { publishReviewPlan, publishReviewSummary, PublishReviewResult } from "../ado/publisher";
import { FindingVerification, ReviewRevision, reconcileFindings, ReconciliationPlan, StoredFinding } from "../review/lifecycle";
import { ReviewProfile } from "../review/lenses";
import { detectRepositoryLicense } from "../review/license";
import { relatedFileCandidates } from "../review/related-files";
import { ReviewInput } from "../review/types";
import { ReviewModel, ReviewRun, runReview } from "./review";
import { runVerification } from "./verification";

export interface AdoReviewOptions {
  pullRequestId: number;
  model: ReviewModel;
  profile?: Partial<ReviewProfile>;
  maxChangedFiles?: number;
  maxFileCharacters?: number;
  maxRelatedFiles?: number;
  maxRelatedFileCharacters?: number;
  maxRelatedTotalCharacters?: number;
  maxRelatedCandidates?: number;
  /** A deterministic fake or a caller can disable the separate recheck. */
  verifyPrevious?: boolean;
  /** Optional event delivery key recorded in the durable summary. */
  deliveryKey?: string;
}

export interface AdoReviewRun {
  review: ReviewRun;
  verification: FindingVerification[];
  plan: ReconciliationPlan;
  published: PublishReviewResult;
  storedBefore: StoredFinding[];
  revision: ReviewRevision;
  /** Paths only; content stays inside the bounded prompt input. */
  relatedFiles: string[];
  /** The summary thread is best-effort; findings are already published. */
  summaryThreadId?: number;
}

const LICENSE_CANDIDATES = ["LICENSE", "LICENSE.md", "LICENSE.txt"];

/**
 * Read ADO state at fixed commits, run the model boundary, then publish only
 * validated actions. The caller supplies the authenticated client and model so
 * tests can exercise the same sequence without credentials.
 */
export async function runAdoReview(
  client: AdoReviewClient,
  options: AdoReviewOptions
): Promise<AdoReviewRun> {
  const maxFiles = options.maxChangedFiles ?? 50;
  const maxFileCharacters = options.maxFileCharacters ?? 120_000;
  const maxRelatedFiles = options.maxRelatedFiles ?? 12;
  const maxRelatedFileCharacters = options.maxRelatedFileCharacters ?? 80_000;
  const maxRelatedTotalCharacters = options.maxRelatedTotalCharacters ?? 200_000;
  const maxRelatedCandidates = options.maxRelatedCandidates ?? 96;
  const pr = await client.getPullRequest(options.pullRequestId);
  if (pr.status !== "active") {
    throw new Error("Pull request is not active.");
  }
  const revision: ReviewRevision = {
    source: commitId(pr.lastMergeSourceCommit.commitId, "source"),
    target: commitId(pr.lastMergeTargetCommit.commitId, "target")
  };
  await postReviewStatus(client, options.pullRequestId, "pending", "Masthead review in progress.");
  try {
    const identity = await client.getAuthenticatedIdentity();
    if (!identity.id) throw new Error("Azure DevOps did not provide a Masthead identity.");
    const storedBefore = await readStoredFindings(client, options.pullRequestId, identity.id);
    const previousFindings = storedBefore.map((item) => ({
      finding: item.finding,
      state: item.state === "active" ? "active" as const : item.state === "dismissed" ? "dismissed" as const : "resolved" as const
    }));
    const changedFiles = await readChangedFiles(client, options.pullRequestId, revision.source, maxFiles, maxFileCharacters);
    const relatedFiles = await readRelatedFiles(client, changedFiles, revision.source, {
      maxFiles: maxRelatedFiles,
      maxFileCharacters: maxRelatedFileCharacters,
      maxTotalCharacters: maxRelatedTotalCharacters,
      maxCandidates: maxRelatedCandidates
    });
    const repositoryLicense = await readRepositoryLicense(client, revision.target);
    const input: ReviewInput = {
      title: pr.title,
      description: pr.description,
      changedFiles,
      repositoryLicense,
      ...(relatedFiles.length === 0 ? {} : { relatedFiles }),
      ...(previousFindings.length === 0 ? {} : { previousFindings })
    };
    const review = await runReview(input, options.profile, options.model);
    const verification = options.verifyPrevious === false
      ? []
      : (await runVerification({
          findings: storedBefore,
          changedFiles,
          ...(relatedFiles.length === 0 ? {} : { relatedFiles }),
          revision
        }, options.model)).verifications;
    const plan = reconcileFindings(storedBefore, review.result, verification, revision, revision, identity.id);
    const published = plan.actions.length === 0
      ? { created: [], resolved: [], withdrawn: [], skipped: [] }
      : await publishReviewPlan(client, {
          pullRequestId: options.pullRequestId,
          revision,
          botId: identity.id,
          plan
        });
    await postReviewStatus(
      client,
      options.pullRequestId,
      "succeeded",
      review.result.findings.length === 0
        ? "Masthead review completed with no findings."
        : `Masthead review completed with ${review.result.findings.length} advisory finding${review.result.findings.length === 1 ? "" : "s"}.`
    );
    let summaryThreadId: number | undefined;
    try {
      const summary = await publishReviewSummary(client, {
        pullRequestId: options.pullRequestId,
        botId: identity.id,
        revision,
        summary: review.result.summary,
        findingCount: review.result.findings.length,
        ...(review.result.guide ? { guide: review.result.guide } : {}),
        ...(options.deliveryKey ? { deliveryKey: options.deliveryKey } : {})
      });
      summaryThreadId = summary.threadId;
    } catch {
      // The findings and status are already published; a summary failure is not
      // allowed to turn a completed review into a failed one.
    }
    return {
      review,
      verification,
      plan,
      published,
      storedBefore,
      revision,
      relatedFiles: relatedFiles.map((file) => file.path),
      ...(summaryThreadId ? { summaryThreadId } : {})
    };
  } catch (error) {
    await postReviewStatus(client, options.pullRequestId, "error", "Masthead review failed before completion.");
    throw error;
  }
}

/** Status posting is advisory infrastructure; it must not hide the review result. */
async function postReviewStatus(
  client: AdoReviewClient,
  pullRequestId: number,
  state: "pending" | "succeeded" | "error",
  description: string
): Promise<void> {
  try {
    await client.createPullRequestStatus(pullRequestId, {
      state,
      description,
      context: { genre: "masthead", name: "review" }
    });
  } catch {
    // A missing status permission must not block review publication.
  }
}

/** Read the existing bot-owned metadata without treating threads as trusted input. */
async function readStoredFindings(
  client: AdoReviewClient,
  pullRequestId: number,
  botId: string
): Promise<StoredFinding[]> {
  const threads = await client.listThreads(pullRequestId);
  return storedFindingsFromThreads(threads, botId);
}

/** Fetch source content for every changed file, with explicit bounds. */
async function readChangedFiles(
  client: AdoReviewClient,
  pullRequestId: number,
  sourceCommit: string,
  maxFiles: number,
  maxFileCharacters: number
): Promise<ReviewInput["changedFiles"]> {
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || !Number.isSafeInteger(maxFileCharacters) || maxFileCharacters < 1) {
    throw new Error("Invalid review file limits.");
  }
  const changes = await client.listPullRequestChanges(pullRequestId);
  if (changes.length > maxFiles) {
    throw new Error(`Pull request changes ${maxFiles} file limit.`);
  }
  const files: ReviewInput["changedFiles"] = [];
  for (const change of changes) {
    if (change.changeType === "delete") {
      files.push({ path: change.path, changeType: "delete" });
      continue;
    }
    const content = await client.getItemContent(sourceCommit, change.path);
    if (content === null) {
      throw new Error(`Changed file content is unavailable: ${change.path}`);
    }
    if (content.length > maxFileCharacters) {
      throw new Error(`Changed file exceeds the content budget: ${change.path}`);
    }
    files.push({ path: change.path, changeType: change.changeType, content });
  }
  return files;
}

/**
 * Fetch a bounded set of unchanged imports and nearby tests. Candidates are
 * deterministic and every item must exist at the fixed source commit.
 */
async function readRelatedFiles(
  client: AdoReviewClient,
  changedFiles: ReviewInput["changedFiles"],
  sourceCommit: string,
  limits: { maxFiles: number; maxFileCharacters: number; maxTotalCharacters: number; maxCandidates: number }
): Promise<Array<{ path: string; content: string }>> {
  if (!Number.isSafeInteger(limits.maxFiles) || limits.maxFiles < 1 ||
      !Number.isSafeInteger(limits.maxFileCharacters) || limits.maxFileCharacters < 1 ||
      !Number.isSafeInteger(limits.maxTotalCharacters) || limits.maxTotalCharacters < 1 ||
      !Number.isSafeInteger(limits.maxCandidates) || limits.maxCandidates < 1) {
    throw new Error("Invalid related-file limits.");
  }
  const files: Array<{ path: string; content: string }> = [];
  let totalCharacters = 0;
  for (const candidate of relatedFileCandidates(changedFiles).slice(0, limits.maxCandidates)) {
    if (files.length >= limits.maxFiles || totalCharacters >= limits.maxTotalCharacters) break;
    const content = await client.getItemContent(sourceCommit, candidate);
    if (content === null || content.includes("\u0000")) continue;
    if (content.length > limits.maxFileCharacters) continue;
    if (totalCharacters + content.length > limits.maxTotalCharacters) continue;
    files.push({ path: candidate, content });
    totalCharacters += content.length;
  }
  return files;
}

/** License evidence comes from the target branch, not the model or PR text. */
async function readRepositoryLicense(
  client: AdoReviewClient,
  targetCommit: string
): Promise<ReturnType<typeof detectRepositoryLicense>> {
  const files: Record<string, string> = {};
  for (const candidate of LICENSE_CANDIDATES) {
    const content = await client.getItemContent(targetCommit, candidate);
    if (content !== null) files[candidate] = content;
  }
  return detectRepositoryLicense(files);
}

function commitId(value: string, name: string): string {
  if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(value)) {
    throw new Error(`Pull request has an invalid ${name} commit ID.`);
  }
  return value;
}

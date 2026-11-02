// Orchestrates one ADO pull request through the validated review engine and the
// publisher. This is deliberately a single-run operation: event deduplication,
// settings lookup and service-hook deployment belong to the surrounding worker.
import { AdoReviewClient } from "../ado/client";
import { storedFindingsFromThreads } from "../ado/metadata";
import { publishReviewPlan, PublishReviewResult } from "../ado/publisher";
import { ReviewRevision, reconcileFindings, ReconciliationPlan, StoredFinding } from "../review/lifecycle";
import { ReviewProfile } from "../review/lenses";
import { detectRepositoryLicense } from "../review/license";
import { ReviewInput } from "../review/types";
import { ReviewModel, ReviewRun, runReview } from "./review";

export interface AdoReviewOptions {
  pullRequestId: number;
  model: ReviewModel;
  profile?: Partial<ReviewProfile>;
  maxChangedFiles?: number;
  maxFileCharacters?: number;
}

export interface AdoReviewRun {
  review: ReviewRun;
  plan: ReconciliationPlan;
  published: PublishReviewResult;
  storedBefore: StoredFinding[];
  revision: ReviewRevision;
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
  const pr = await client.getPullRequest(options.pullRequestId);
  if (pr.status !== "active") {
    throw new Error("Pull request is not active.");
  }
  const revision: ReviewRevision = {
    source: commitId(pr.lastMergeSourceCommit.commitId, "source"),
    target: commitId(pr.lastMergeTargetCommit.commitId, "target")
  };
  const identity = await client.getAuthenticatedIdentity();
  if (!identity.id) throw new Error("Azure DevOps did not provide a Masthead identity.");
  const storedBefore = await readStoredFindings(client, options.pullRequestId, identity.id);
  const previousFindings = storedBefore.map((item) => ({
    finding: item.finding,
    state: item.state === "active" ? "active" as const : item.state === "dismissed" ? "dismissed" as const : "resolved" as const
  }));
  const changedFiles = await readChangedFiles(client, options.pullRequestId, revision.source, maxFiles, maxFileCharacters);
  const repositoryLicense = await readRepositoryLicense(client, revision.target);
  const input: ReviewInput = {
    title: pr.title,
    description: pr.description,
    changedFiles,
    repositoryLicense,
    ...(previousFindings.length === 0 ? {} : { previousFindings })
  };
  const review = await runReview(input, options.profile, options.model);
  const plan = reconcileFindings(storedBefore, review.result, [], revision, revision, identity.id);
  const published = plan.actions.length === 0
    ? { created: [], resolved: [], withdrawn: [], skipped: [] }
    : await publishReviewPlan(client, {
        pullRequestId: options.pullRequestId,
        revision,
        botId: identity.id,
        plan
      });
  return { review, plan, published, storedBefore, revision };
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

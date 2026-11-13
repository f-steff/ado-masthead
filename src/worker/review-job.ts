// One pull-request review driven by environment variables. Shared by the
// manual/pipeline entry point and the event router.
import { latestRunFromThreads } from "../ado/run-metadata";
import { complete, providerFromEnvironment } from "../providers";
import { ReviewRevision, sameRevision } from "../review/lifecycle";
import { reviewSelection } from "../settings";
import { runAdoReview } from "./ado-review";
import { createJobContext, truthy } from "./job-context";
import { ReviewModel } from "./review";
import { loadReviewSettings, reviewGate } from "./settings";

export async function runReviewJob(env: NodeJS.ProcessEnv): Promise<void> {
  const { organizationUrl, pullRequestId, auth, client } = createJobContext(env);

  // Read the destination repository's project and gate before the provider is
  // configured, so a disabled review cannot spend tokens or create comments.
  const pr = await client.getPullRequest(pullRequestId);
  const destinationProjectId = pr.repository.project?.id || (env.MASTHEAD_PROJECT_ID || "").trim();
  if (!destinationProjectId || !pr.repository.id) {
    throw new Error("Azure DevOps did not return the pull request's destination project and repository.");
  }
  const snapshot = (env.MASTHEAD_SETTINGS_JSON || "").trim();
  const extensionId = (env.MASTHEAD_EXTENSION_ID || "").trim();
  let reviewStarted = false;
  try {
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
      // A required status policy must not block a repository that opted out.
      await postStatus(client, pullRequestId, "notApplicable", "Masthead review is disabled for this project or repository.");
      console.log(JSON.stringify({
        skipped: "review-disabled",
        organizationEnabled: settings.organization.enabled,
        projectEnabled: settings.project.enabled,
        repositoryEnabled: settings.project.repositories[settings.repositoryId]?.enabled === true,
        settingsSource: settings.source,
        pullRequestId
      }, null, 2));
      return;
    }

    const currentRevision: ReviewRevision = {
      source: pr.lastMergeSourceCommit.commitId,
      target: pr.lastMergeTargetCommit.commitId
    };
    const identity = await client.getAuthenticatedIdentity();
    const lastRun = latestRunFromThreads(await client.listThreads(pullRequestId), identity.id);
    if (lastRun && sameRevision(lastRun.metadata.revision, currentRevision) &&
        !truthy(env.MASTHEAD_FORCE_REVIEW)) {
      await postStatus(client, pullRequestId, "succeeded", "Masthead review already completed for this revision.");
      console.log(JSON.stringify({
        skipped: "revision-already-reviewed",
        pullRequestId,
        reviewedAt: lastRun.metadata.reviewedAt,
        revision: currentRevision
      }, null, 2));
      return;
    }

    const selection = reviewSelection(settings.organization, settings.project, settings.repositoryId);
    const provider = providerFromEnvironment(env, selection);
    const model: ReviewModel = (request, signal) => complete(provider, request, fetch, signal);
    reviewStarted = true;
    const run = await runAdoReview(client, {
      pullRequestId,
      model,
      profile: selection.profile,
      ...(env.MASTHEAD_DELIVERY_KEY ? { deliveryKey: env.MASTHEAD_DELIVERY_KEY } : {})
    });
    console.log(JSON.stringify({
      provider: provider.name,
      model: provider.model,
      reasoningEffort: provider.reasoningEffort,
      thinkingBudget: provider.thinkingBudget,
      enabledLenses: selection.profile.enabledLenses,
      reviewGuide: selection.profile.reviewGuide,
      settingsSource: settings.source,
      pullRequestId,
      summary: run.review.result.summary,
      findingCount: run.review.result.findings.length,
      suppressedCount: run.review.suppressedCount,
      relatedFiles: run.relatedFiles,
      summaryThreadId: run.summaryThreadId,
      verified: run.verification.map((item) => ({ findingId: item.findingId, outcome: item.outcome })),
      created: run.published.created,
      resolved: run.published.resolved,
      withdrawn: run.published.withdrawn,
      skipped: run.published.skipped
    }, null, 2));
  } catch (error) {
    if (!reviewStarted) {
      // Configuration and setup failures happen before runAdoReview owns status.
      await postStatus(client, pullRequestId, "error", "Masthead review could not start.");
    }
    throw error;
  }
}

/** Never let a status-permission problem hide the original review failure. */
async function postStatus(
  client: ReturnType<typeof createJobContext>["client"],
  pullRequestId: number,
  state: "notApplicable" | "succeeded" | "error",
  description: string
): Promise<void> {
  await client.createPullRequestStatus(pullRequestId, {
    state,
    description,
    context: { genre: "masthead", name: "review" }
  }).catch(() => undefined);
}

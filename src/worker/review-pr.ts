// Pipeline entry point for one pull-request review. Configuration comes from
// environment variables so the provider key and ADO token remain secret
// variables; this process never prints either value.
import { AdoClient } from "../ado/client";
import { complete, listProviderModels, providerFromEnvironment } from "../providers";
import { normalizeModelCatalog } from "../models/catalog";
import { reviewSelection } from "../settings";
import { runAdoReview } from "./ado-review";
import { resolveAdoAuth } from "./auth";
import { ReviewModel } from "./review";
import { loadReviewSettings, readExtensionSetting, reviewGate, writeExtensionSetting } from "./settings";

async function main(): Promise<void> {
  const env = process.env;
  const organizationUrl = required(env, "AZURE_DEVOPS_ORG_URL");
  const project = required(env, "MASTHEAD_PROJECT");
  const repositoryId = required(env, "MASTHEAD_REPOSITORY");
  const pullRequestId = positive(required(env, "MASTHEAD_PULL_REQUEST_ID"));
  const auth = resolveAdoAuth(env);
  const client = new AdoClient({
    organizationUrl,
    project,
    repositoryId,
    token: auth.token,
    tokenScheme: auth.scheme
  });

  // Read the destination repository's project and gate before the provider is
  // configured, so a disabled review cannot spend tokens or create comments.
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

  const selection = reviewSelection(settings.organization, settings.project, settings.repositoryId);
  const provider = providerFromEnvironment(env, selection);
  await refreshModelCatalog(env, settings, provider);
  const model: ReviewModel = (request, signal) => complete(provider, request, fetch, signal);
  const run = await runAdoReview(client, {
    pullRequestId,
    model,
    profile: selection.profile
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
    verified: run.verification.map((item) => ({ findingId: item.findingId, outcome: item.outcome })),
    created: run.published.created,
    resolved: run.published.resolved,
    withdrawn: run.published.withdrawn,
    skipped: run.published.skipped
  }, null, 2));
}

/** Model metadata is best-effort; it must never block or fail a review. */
async function refreshModelCatalog(
  env: NodeJS.ProcessEnv,
  settings: Awaited<ReturnType<typeof loadReviewSettings>>,
  provider: ReturnType<typeof providerFromEnvironment>
): Promise<void> {
  if (!settings.extensionId) return;
  const options = {
    organizationUrl: required(env, "AZURE_DEVOPS_ORG_URL"),
    token: resolveAdoAuth(env).token,
    tokenScheme: resolveAdoAuth(env).scheme,
    publisher: (env.MASTHEAD_EXTENSION_PUBLISHER || "f-steff").trim(),
    extensionId: settings.extensionId,
    timeoutMs: 8_000
  };
  try {
    const models = await listProviderModels({ ...provider, timeoutMs: 5_000 });
    if (models.length === 0) return;
    const existing = normalizeModelCatalog(await readExtensionSetting(options, "modelCatalog"));
    const next = {
      ...existing,
      [provider.name]: { models, refreshedAt: new Date().toISOString() }
    };
    await writeExtensionSetting(options, "modelCatalog", next);
  } catch {
    // The review still has its configured model and must proceed.
  }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = (env[name] || "").trim();
  if (!value) throw new Error(`Set ${name}.`);
  return value;
}

function positive(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error("MASTHEAD_PULL_REQUEST_ID must be a positive integer.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("MASTHEAD_PULL_REQUEST_ID is out of range.");
  return parsed;
}

void main().catch((error: unknown) => {
  // Provider and ADO adapters already sanitize response bodies and credentials.
  console.error(error instanceof Error ? error.message : "Review failed.");
  process.exitCode = 1;
});

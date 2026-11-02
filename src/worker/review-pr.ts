// Pipeline entry point for one pull-request review. Configuration comes from
// environment variables so the provider key and ADO token remain secret
// variables; this process never prints either value.
import { AdoClient } from "../ado/client";
import { complete, providerFromEnvironment } from "../providers";
import { runAdoReview } from "./ado-review";
import { ReviewModel } from "./review";

async function main(): Promise<void> {
  const env = process.env;
  const organizationUrl = required(env, "AZURE_DEVOPS_ORG_URL");
  const project = required(env, "MASTHEAD_PROJECT");
  const repositoryId = required(env, "MASTHEAD_REPOSITORY");
  const pullRequestId = positive(required(env, "MASTHEAD_PULL_REQUEST_ID"));
  const systemToken = (env.SYSTEM_ACCESSTOKEN || "").trim();
  const token = (systemToken || env.AZURE_DEVOPS_TOKEN || "").trim();
  if (!token) {
    throw new Error("Set SYSTEM_ACCESSTOKEN in the pipeline or AZURE_DEVOPS_TOKEN locally.");
  }
  const provider = providerFromEnvironment(env);
  const client = new AdoClient({
    organizationUrl,
    project,
    repositoryId,
    token,
    tokenScheme: systemToken ? "bearer" : "basic"
  });
  const model: ReviewModel = (request, signal) => complete(provider, request, fetch, signal);
  const run = await runAdoReview(client, { pullRequestId, model });
  console.log(JSON.stringify({
    provider: provider.name,
    model: provider.model,
    pullRequestId,
    summary: run.review.result.summary,
    findingCount: run.review.result.findings.length,
    suppressedCount: run.review.suppressedCount,
    created: run.published.created,
    resolved: run.published.resolved,
    withdrawn: run.published.withdrawn,
    skipped: run.published.skipped
  }, null, 2));
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

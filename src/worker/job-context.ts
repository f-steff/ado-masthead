// Shared environment and ADO client setup for pipeline entry points. Provider
// keys and tokens stay in environment variables and are never logged here.
import { AdoClient } from "../ado/client";
import { AdoAuth, resolveAdoAuth } from "./auth";

export interface JobContext {
  env: NodeJS.ProcessEnv;
  organizationUrl: string;
  project: string;
  repositoryId: string;
  pullRequestId: number;
  auth: AdoAuth;
  client: AdoClient;
}

export function createJobContext(env: NodeJS.ProcessEnv): JobContext {
  const organizationUrl = required(env, "AZURE_DEVOPS_ORG_URL");
  const project = required(env, "MASTHEAD_PROJECT");
  const repositoryId = required(env, "MASTHEAD_REPOSITORY");
  const pullRequestId = positive(required(env, "MASTHEAD_PULL_REQUEST_ID"), "MASTHEAD_PULL_REQUEST_ID");
  const auth = resolveAdoAuth(env);
  const client = new AdoClient({
    organizationUrl,
    project,
    repositoryId,
    token: auth.token,
    tokenScheme: auth.scheme
  });
  return { env, organizationUrl, project, repositoryId, pullRequestId, auth, client };
}

export function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = (env[name] || "").trim();
  if (!value) throw new Error(`Set ${name}.`);
  return value;
}

export function positive(value: string, name: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} is out of range.`);
  return parsed;
}

/** Pipeline booleans can render as True/False or true/false. */
export function truthy(value: string | undefined): boolean {
  return /^(true|1|yes)$/i.test((value || "").trim());
}

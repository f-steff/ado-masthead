import assert from "node:assert/strict";
import test from "node:test";
import {
  branchPolicyUrl,
  defaultBranchName,
  policyAppliesTo,
  policyConfigurationsUrl,
  summarizeBranchPolicies
} from "../src/extension/shared/policy-state";

const repositoryId = "repo-id";
const mainRef = "refs/heads/main";

function statusPolicy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const { id = 7, isDeleted = false, isEnabled = true, isBlocking = true, ...settings } = overrides;
  return {
    id,
    isDeleted,
    isEnabled,
    isBlocking,
    settings: {
      statusGenre: "masthead",
      statusName: "review",
      policyApplicability: 1,
      invalidateOnSourceUpdate: true,
      defaultDisplayName: "Masthead review",
      scope: [{ repositoryId, refName: mainRef, matchKind: "Exact" }],
      ...settings
    }
  };
}

test("the default branch name is derived from a trusted ref", () => {
  assert.equal(defaultBranchName("refs/heads/main"), "main");
  assert.equal(defaultBranchName("refs/heads/release/1.0"), "release/1.0");
  assert.equal(defaultBranchName("refs/tags/v1"), "");
  assert.equal(defaultBranchName(undefined), "");
});

test("the Masthead status policy is recognized and summarized", () => {
  const summary = summarizeBranchPolicies([
    statusPolicy(),
    statusPolicy({ statusGenre: "other" }),
    statusPolicy({ statusName: "other" })
  ], repositoryId, mainRef);
  assert.equal(summary.total, 3);
  assert.equal(summary.enabled, 3);
  assert.deepEqual(summary.masthead, {
    enabled: true,
    blocking: true,
    conditional: true,
    resetOnSourceUpdate: true,
    displayName: "Masthead review",
    id: 7
  });
});

test("disabled, deleted and optional policies are distinguished", () => {
  assert.equal(summarizeBranchPolicies([
    statusPolicy({ isEnabled: false })
  ], repositoryId, mainRef).masthead?.enabled, false);
  assert.equal(summarizeBranchPolicies([
    statusPolicy({ isDeleted: true, id: 99 })
  ], repositoryId, mainRef).masthead, undefined);
  assert.equal(summarizeBranchPolicies([
    statusPolicy({ isBlocking: false })
  ], repositoryId, mainRef).masthead?.blocking, false);
});

test("policy scopes match exact, prefix, default-branch and project-wide entries", () => {
  const exact = statusPolicy();
  assert.equal(policyAppliesTo(exact, repositoryId, mainRef), true);
  assert.equal(policyAppliesTo(exact, "other-repo", mainRef), false);
  assert.equal(policyAppliesTo(statusPolicy({ scope: [
    { repositoryId, refName: "refs/heads/release/", matchKind: "Prefix" }
  ] }), repositoryId, "refs/heads/release/1.0"), true);
  assert.equal(policyAppliesTo(statusPolicy({ scope: [
    { repositoryId, matchKind: "DefaultBranch" }
  ] }), repositoryId, mainRef), true);
  assert.equal(policyAppliesTo(statusPolicy({ scope: [
    { repositoryId: null, refName: mainRef, matchKind: "Exact" }
  ] }), "other-repo", mainRef), true);
  assert.equal(policyAppliesTo(statusPolicy({ scope: [] }), repositoryId, mainRef), false);
});

test("policy and branch-policy URLs encode repository, project and branch", () => {
  const policyUrl = policyConfigurationsUrl(
    "https://dev.azure.com/contoso/",
    "Sample Project",
    "repo/id",
    "refs/heads/release/1.0"
  );
  assert.equal(
    policyUrl,
    "https://dev.azure.com/contoso/Sample%20Project/_apis/policy/configurations?repositoryId=repo%2Fid&refName=refs%2Fheads%2Frelease%2F1.0&api-version=7.1"
  );
  const branchUrl = branchPolicyUrl(
    "https://dev.azure.com/contoso/",
    "Sample Project",
    "repo/id",
    "release/1.0"
  );
  assert.equal(
    branchUrl,
    "https://dev.azure.com/contoso/Sample%20Project/_settings/repositories?repo=repo%2Fid&_a=policiesMid&refs=refs%2Fheads%2Frelease%2F1.0"
  );
});

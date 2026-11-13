import assert from "node:assert/strict";
import test from "node:test";
import {
  branchPolicyUrl,
  defaultBranchName,
  policyConfigurationsUrl,
  summarizeBranchPolicies
} from "../src/extension/shared/policy-state";

function statusPolicy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7,
    isDeleted: false,
    isEnabled: true,
    isBlocking: true,
    settings: {
      statusGenre: "masthead",
      statusName: "review",
      policyApplicability: 1,
      invalidateOnSourceUpdate: true,
      defaultDisplayName: "Masthead review",
      ...overrides
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
    { id: 8, isEnabled: true, isBlocking: false, settings: { statusGenre: "other", statusName: "review" } },
    { id: 9, isEnabled: true, isBlocking: true, settings: { statusGenre: "masthead", statusName: "other" } }
  ]);
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
  const disabled = summarizeBranchPolicies([
    statusPolicy({}), { ...statusPolicy(), isEnabled: false }
  ]);
  assert.equal(disabled.masthead?.enabled, true);
  assert.equal(summarizeBranchPolicies([
    { ...statusPolicy(), isEnabled: false }
  ]).masthead?.enabled, false);
  assert.equal(summarizeBranchPolicies([
    { ...statusPolicy(), isDeleted: true, id: 99 }
  ]).masthead, undefined);
  assert.equal(summarizeBranchPolicies([
    { ...statusPolicy(), isBlocking: false }
  ]).masthead?.blocking, false);
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

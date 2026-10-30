import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultOrganizationSettings,
  defaultProjectSettings,
  isRepositoryEnabled,
  seedRepositories,
  setRepositoryProfile
} from "../src";

test("native deployment is the default and broker is opt-in", () => {
  const settings = defaultOrganizationSettings();
  assert.equal(settings.deploymentMode, "native");
  assert.equal(settings.brokerVerified, false);
  assert.equal(settings.nativeWebhookName, "MastheadPR");
});

test("repositories are disabled until explicitly enabled", () => {
  const project = defaultProjectSettings();
  assert.equal(isRepositoryEnabled(project, "repo-a"), false);
  const seeded = seedRepositories(project, ["repo-a", "repo-b"]);
  assert.equal(isRepositoryEnabled(seeded, "repo-a"), true);
  assert.equal(isRepositoryEnabled(seeded, "repo-b"), true);
});

test("a project-wide disable overrides a repository choice", () => {
  const project = seedRepositories(defaultProjectSettings(), ["repo-a"]);
  assert.equal(isRepositoryEnabled({ ...project, enabled: false }, "repo-a"), false);
});

test("syncing repositories does not re-enable an explicit disable", () => {
  const project = {
    ...defaultProjectSettings(),
    repositories: { "repo-a": { enabled: false } }
  };
  const synced = seedRepositories(project, ["repo-a", "repo-b"]);
  assert.equal(isRepositoryEnabled(synced, "repo-a"), false);
  assert.equal(isRepositoryEnabled(synced, "repo-b"), true);
});

test("a repository can override its project review profile", () => {
  const seeded = seedRepositories(defaultProjectSettings(), ["repo-a"]);
  const configured = setRepositoryProfile(
    seeded,
    "repo-a",
    ["correctness", "security", "license"],
    false
  );
  assert.deepEqual(configured.repositories["repo-a"].profile, {
    enabledLenses: ["correctness", "security", "license"],
    reviewGuide: false
  });
});

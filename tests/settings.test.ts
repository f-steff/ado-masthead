import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultOrganizationSettings,
  defaultProjectSettings,
  isRepositoryEnabled,
  isReviewEnabled,
  newRepositoryEnabled,
  normalizeOrganizationSettings,
  normalizeProjectSettings,
  seedProjectRepositories,
  seedRepositories,
  setRepositoryProfile
} from "../src";

test("native deployment is the default and broker is opt-in", () => {
  const settings = defaultOrganizationSettings();
  assert.equal(settings.enabled, true);
  assert.equal(settings.defaultProjectEnabled, true);
  assert.equal(settings.defaultRepositoryEnabled, false);
  assert.equal(settings.deploymentMode, "native");
  assert.equal(settings.brokerVerified, false);
  assert.equal(settings.nativeWebhookName, "MastheadPR");
});

test("new repositories follow the project default or inherit the organization default", () => {
  const organization = defaultOrganizationSettings();
  const inherited = defaultProjectSettings();
  assert.equal(newRepositoryEnabled(organization, inherited), false);
  assert.equal(newRepositoryEnabled({ ...organization, defaultRepositoryEnabled: true }, inherited), true);
  assert.equal(newRepositoryEnabled(organization, { ...inherited, defaultRepositoryEnabled: "enabled" }), true);
  assert.equal(newRepositoryEnabled({ ...organization, defaultRepositoryEnabled: true }, { ...inherited, defaultRepositoryEnabled: "disabled" }), false);
  const seeded = seedProjectRepositories(organization, { ...inherited, defaultRepositoryEnabled: "enabled" }, ["repo-a"]);
  assert.equal(seeded.repositories["repo-a"].enabled, true);
});

test("the organization master switch overrides project and repository choices", () => {
  const organization = defaultOrganizationSettings();
  const project = seedRepositories(defaultProjectSettings(), ["repo-a"], true);
  assert.equal(isReviewEnabled(organization, project, "repo-a"), true);
  assert.equal(isReviewEnabled({ ...organization, enabled: false }, project, "repo-a"), false);
  assert.equal(isReviewEnabled(organization, { ...project, enabled: false }, "repo-a"), false);
});

test("persisted malformed settings cannot silently enable a repository", () => {
  const organization = normalizeOrganizationSettings({
    enabled: false,
    deploymentMode: "broker",
    pipelineId: -1,
    pipelineProject: " SampleProject "
  });
  assert.equal(organization.enabled, false);
  assert.equal(organization.deploymentMode, "broker");
  assert.equal(organization.pipelineId, undefined);
  assert.equal(organization.pipelineProject, "SampleProject");

  const project = normalizeProjectSettings({
    enabled: true,
    defaultRepositoryEnabled: "enabled",
    repositories: {
      "repo-a": { enabled: "yes" },
      "repo-b": { enabled: false },
      "repo-c": null
    }
  });
  assert.equal(project.defaultRepositoryEnabled, "enabled");
  assert.deepEqual(project.repositories, {
    "repo-a": { enabled: false },
    "repo-b": { enabled: false }
  });
  assert.equal(normalizeProjectSettings({ repositories: {} }).defaultRepositoryEnabled, "inherit");
});

test("repositories are disabled until explicitly enabled", () => {
  const project = defaultProjectSettings();
  assert.equal(isRepositoryEnabled(project, "repo-a"), false);
  const seeded = seedRepositories(project, ["repo-a", "repo-b"]);
  assert.equal(isRepositoryEnabled(seeded, "repo-a"), false);
  assert.equal(isRepositoryEnabled(seeded, "repo-b"), false);
  const enabled = seedRepositories(project, ["repo-a"], true);
  assert.equal(isRepositoryEnabled(enabled, "repo-a"), true);
});

test("a project-wide disable overrides a repository choice", () => {
  const project = seedRepositories(defaultProjectSettings(), ["repo-a"], true);
  assert.equal(isRepositoryEnabled({ ...project, enabled: false }, "repo-a"), false);
});

test("syncing repositories does not re-enable an explicit disable", () => {
  const project = {
    ...defaultProjectSettings(),
    repositories: { "repo-a": { enabled: false } }
  };
  const synced = seedRepositories(project, ["repo-a", "repo-b"]);
  assert.equal(isRepositoryEnabled(synced, "repo-a"), false);
  assert.equal(isRepositoryEnabled(synced, "repo-b"), false);
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

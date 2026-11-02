import assert from "node:assert/strict";
import test from "node:test";
import { filterPipelines, pipelineLabel } from "../src/extension/shared/pipelines";
import type { ReviewLensId } from "../src";
import {
  defaultOrganizationSettings,
  defaultProjectSettings,
  isRepositoryEnabled,
  isReviewEnabled,
  newRepositoryEnabled,
  normalizeOrganizationSettings,
  normalizeProjectSettings,
  reviewSelection,
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

test("pipeline search matches substrings in project, name and ID", () => {
  const pipelines = [
    { project: "SampleProject", id: 12, name: "Masthead review" },
    { project: "Contoso", id: 7, name: "Nightly build" }
  ];
  assert.equal(pipelineLabel(pipelines[0]), "SampleProject / Masthead review (#12)");
  assert.deepEqual(filterPipelines(pipelines, "mast").map((item) => item.id), [12]);
  assert.deepEqual(filterPipelines(pipelines, "CONTOSO").map((item) => item.id), [7]);
  assert.deepEqual(filterPipelines(pipelines, "#7").map((item) => item.id), [7]);
  assert.equal(filterPipelines(pipelines, "", 1).length, 1);
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

test("a cross-project or fork PR is gated by the destination repository", () => {
  const organization = defaultOrganizationSettings();
  const destination = seedRepositories(
    { ...defaultProjectSettings(), enabled: true },
    ["destination-repo"],
    true
  );
  const source = seedRepositories(
    { ...defaultProjectSettings(), enabled: false },
    ["source-fork"],
    true
  );
  assert.equal(isReviewEnabled(organization, destination, "destination-repo"), true);
  assert.equal(isReviewEnabled(organization, source, "source-fork"), false);
  assert.equal(isReviewEnabled(organization, destination, "source-fork"), false);
});

test("new repositories follow the configured defaults when no switch exists", () => {
  const project = defaultProjectSettings();
  assert.equal(isReviewEnabled(defaultOrganizationSettings(), project, "new-repo"), false);
  assert.equal(isReviewEnabled(
    { ...defaultOrganizationSettings(), defaultRepositoryEnabled: true },
    project,
    "new-repo"
  ), true);
  assert.equal(isReviewEnabled(
    defaultOrganizationSettings(),
    { ...project, defaultRepositoryEnabled: "enabled" },
    "new-repo"
  ), true);
  assert.equal(isReviewEnabled(
    { ...defaultOrganizationSettings(), defaultRepositoryEnabled: true },
    { ...project, defaultRepositoryEnabled: "disabled" },
    "new-repo"
  ), false);
  assert.equal(isReviewEnabled(
    { ...defaultOrganizationSettings(), defaultRepositoryEnabled: true },
    { ...project, repositories: { "new-repo": { enabled: false } } },
    "new-repo"
  ), false);
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
  assert.equal(organization.pipelineName, undefined);
  const named = normalizeOrganizationSettings({
    pipelineProject: "SampleProject",
    pipelineId: 7,
    pipelineName: " Masthead review "
  });
  assert.equal(named.pipelineName, "Masthead review");

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

test("review profiles inherit from organization to project to repository", () => {
  const organization = {
    ...defaultOrganizationSettings(),
    provider: "deepseek",
    model: "org-model",
    profile: { enabledLenses: ["correctness", "license"] as ReviewLensId[], reviewGuide: false }
  };
  const project = {
    ...defaultProjectSettings(),
    provider: "openai",
    model: "project-model",
    profile: { enabledLenses: ["correctness", "tests"] as ReviewLensId[], reviewGuide: true }
  };
  const inherited = reviewSelection(organization, project, "repo-a");
  assert.deepEqual(inherited.profile.enabledLenses, ["correctness", "license"]);
  assert.equal(inherited.profile.reviewGuide, false);
  assert.equal(inherited.provider, "openai");
  assert.equal(inherited.model, "project-model");

  const overridden = reviewSelection(
    organization,
    {
      ...project,
      inheritProfile: false,
      repositories: {
        "repo-a": {
          enabled: true,
          profile: { enabledLenses: ["correctness", "security"], reviewGuide: false },
          provider: "anthropic",
          model: "repo-model"
        }
      }
    },
    "repo-a"
  );
  assert.deepEqual(overridden.profile.enabledLenses, ["correctness", "security"]);
  assert.equal(overridden.provider, "anthropic");
  assert.equal(overridden.model, "repo-model");

  const repositoryOnly = reviewSelection(organization, {
    ...project,
    inheritProfile: true,
    repositories: {
      "repo-a": {
        enabled: true,
        profile: { enabledLenses: ["correctness", "tests"], reviewGuide: false }
      }
    }
  }, "repo-a");
  assert.deepEqual(repositoryOnly.profile.enabledLenses, ["correctness", "tests"]);
  assert.equal(repositoryOnly.profile.reviewGuide, false);
});

test("malformed profile data is dropped rather than trusted", () => {
  const organization = normalizeOrganizationSettings({
    enabled: true,
    profile: { enabledLenses: ["made-up"], reviewGuide: true }
  });
  assert.equal(organization.profile, undefined);
  const project = normalizeProjectSettings({
    enabled: true,
    inheritProfile: false,
    profile: { enabledLenses: ["correctness"] },
    repositories: {
      "repo-a": { enabled: true, profile: { enabledLenses: ["unknown"] } }
    }
  });
  assert.equal(project.profile?.enabledLenses?.[0], "correctness");
  assert.equal(project.repositories["repo-a"].profile, undefined);
});

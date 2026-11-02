// Exercise the actual workflow guard and packaging helpers without credentials,
// network calls, GitHub mutations or Marketplace publication.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { buildStatusArgs } from "../ci/status.mjs";
import { parseValidationStatus } from "../ci/validation.mjs";
import { isVersionAlreadyPublished, nextVersion, parseTags, validateVersion } from "../ci/version.mjs";

const require = createRequire(import.meta.url);
const { buildArgs, mergeManifest, validateArguments } = require("../scripts/tfx.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Use the same YAML source that GitHub will execute, not a duplicated test guard. */
function workflow(name) {
  return parse(fs.readFileSync(path.join(root, ".github/workflows", name), "utf8"));
}

test("dev and stable editions follow the shared 0.x tag sequence", () => {
  assert.equal(nextVersion("dev", []), "0.0.1");
  assert.equal(nextVersion("stable", []), "0.1.0");
  const tags = parseTags("v0.1.0\nv0.1.1\nv0.1.8\nv0.2.0\nv0.2.3\nother\nv1.9.0");
  assert.equal(tags.length, 5);
  assert.equal(nextVersion("dev", tags), "0.2.4");
  assert.equal(nextVersion("stable", tags), "0.3.0");
  assert.throws(() => nextVersion("other", tags));
  assert.equal(nextVersion("stable", parseTags("v0.8.4")), "0.9.0");
});

test("an already-uploaded version can continue to validation after a status outage", () => {
  assert.equal(isVersionAlreadyPublished(
    "error: Version number must increase each time an extension is published. Current version: 0.0.14 Updated version: 0.0.14"
  ), true);
  assert.equal(isVersionAlreadyPublished("error: invalid manifest"), false);
  assert.equal(isVersionAlreadyPublished(""), false);
});

test("release status calls use explicit fields instead of ignored stdin", () => {
  const sha = "a".repeat(40);
  const args = buildStatusArgs("f-steff/ado-masthead", sha, "masthead-dev", "0.0.2");
  assert.deepEqual(args.slice(0, 4), [
    "api",
    "--method",
    "POST",
    `repos/f-steff/ado-masthead/statuses/${sha}`
  ]);
  assert.ok(args.includes("state=success"));
  assert.ok(args.includes("context=Marketplace: masthead-dev"));
  assert.ok(args.includes("description=Published Masthead 0.0.2"));
  assert.ok(args.includes("target_url=https://marketplace.visualstudio.com/items?itemName=f-steff.masthead-dev"));
  assert.ok(!args.includes("--input"));
  assert.throws(() => buildStatusArgs("../repo", sha, "masthead", "0.0.2"), /Invalid release status/);
  assert.throws(() => buildStatusArgs("f-steff/ado-masthead", "short", "masthead", "0.0.2"), /Invalid release status/);
  assert.throws(() => buildStatusArgs("f-steff/ado-masthead", sha, "other", "0.0.2"), /Invalid release status/);
  assert.throws(() => buildStatusArgs("f-steff/ado-masthead", sha, "masthead", "v0.0.2"), /Invalid release status/);
});

test("release overrides cannot inject tags, workflow outputs or manifest paths", () => {
  for (const value of ["", "../manifest", "0.1.0\ntag=bad", "1.0.0", "v0.1.0", "0.1.0; command"]) {
    assert.throws(() => validateVersion(value, "dev"));
  }
  assert.throws(() => validateVersion("0.1.2", "stable"));
  assert.throws(() => validateVersion("0.1.0", "unknown"));
  assert.equal(validateVersion("0.1.0", "stable"), "0.1.0");
});

test("edition manifests retain one code package and distinct public/private identities", () => {
  const base = JSON.parse(fs.readFileSync(path.join(root, "ado-manifests/azure-devops-extension-base.json"), "utf8"));
  for (const edition of ["dev", "stable"]) {
    const override = JSON.parse(fs.readFileSync(path.join(root, `ado-manifests/azure-devops-extension-${edition}.json`), "utf8"));
    const effective = mergeManifest(base, override);
    assert.equal(effective.id, edition === "dev" ? "masthead-dev" : "masthead");
    assert.equal(effective.public, edition === "stable");
    assert.equal(effective.publisher, "f-steff");
    assert.equal(effective.content.license.path, "LICENSE");
    assert.equal(effective.content.details.path, "marketplace-advertisement.md");
    assert.deepEqual(effective.files, base.files);
    assert.ok(effective.files.some((entry) => entry.path === "dist/core/index.mjs" && entry.contentType === "application/javascript"));
    assert.ok(effective.contributions.some((entry) => entry.targets.includes("ms.vss-web.collection-admin-hub-group")));
    assert.ok(effective.contributions.some((entry) => entry.targets.includes("ms.vss-web.project-admin-hub-group")));
    assert.deepEqual(effective.scopes, ["vso.extension.data_write", "vso.code", "vso.build", "vso.build_execute", "vso.project"]);
    assert.ok(!JSON.stringify(effective).includes("static-dev"));
  }
});

test("the extension manifest ships the approved icon set", () => {
  const base = JSON.parse(fs.readFileSync(path.join(root, "ado-manifests/azure-devops-extension-base.json"), "utf8"));
  assert.deepEqual(base.icons, {
    default: "images/icon-128.png",
    large: "images/icon-256.png"
  });
  assert.deepEqual(base.branding, { color: "#0e7490", theme: "dark" });

  const files = new Set(base.files.map((entry) => entry.path));
  for (const size of [32, 128, 256]) {
    const file = `images/icon-${size}.png`;
    assert.ok(files.has(file), file);
    const data = fs.readFileSync(path.join(root, file));
    assert.equal(data.toString("ascii", 1, 4), "PNG");
    assert.equal(data.readUInt32BE(16), size);
    assert.equal(data.readUInt32BE(20), size);
  }

  const hub = base.contributions.find((entry) => entry.targets.includes("ms.vss-web.collection-admin-hub-group"));
  assert.ok(hub);
  assert.equal(hub.properties.icon, "images/icon-32.png");
  const svg = fs.readFileSync(path.join(root, "images/icon.svg"), "utf8");
  assert.match(svg, /viewBox="0 0 256 256"/);
  assert.match(svg, /Masthead crow's nest lookout/);
});

test("the organization and project pages initialize the ADO host and split settings", () => {
  const orgHtml = fs.readFileSync(path.join(root, "src/extension/hub/index.html"), "utf8");
  const orgScript = fs.readFileSync(path.join(root, "src/extension/hub/index.ts"), "utf8");
  const projectHtml = fs.readFileSync(path.join(root, "src/extension/project/index.html"), "utf8");
  const projectScript = fs.readFileSync(path.join(root, "src/extension/project/index.ts"), "utf8");
  const host = fs.readFileSync(path.join(root, "src/extension/shared/host.ts"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "ado-manifests/azure-devops-extension-base.json"), "utf8"));
  assert.match(orgHtml, /id="host-status"/);
  assert.match(orgHtml, /id="org-enabled"/);
  assert.match(orgHtml, /id="default-project"/);
  assert.match(orgHtml, /id="default-repository"/);
  assert.match(orgHtml, /id="defaults-heading"/);
  assert.match(orgHtml, /Defaults for new projects and repositories/);
  assert.match(orgHtml, /\.\.\/\.\.\/\.\.\/images\/icon-128\.png/);
  assert.match(orgHtml, /id="pipeline-search"/);
  assert.match(orgHtml, /id="pipeline-project"/);
  assert.match(orgHtml, /id="pipeline-options"/);
  assert.match(orgHtml, /id="extension-id"/);
  assert.match(orgHtml, /id="extension-publisher"/);
  assert.match(orgHtml, /id="clear-pipeline"/);
  assert.match(orgHtml, /id="install-pipeline"/);
  assert.match(orgHtml, /id="delete-pipeline"/);
  assert.match(orgHtml, /id="pipeline-create-project"/);
  assert.match(orgScript, /async function installPipeline/);
  assert.match(orgScript, /async function deletePipeline/);
  assert.match(orgHtml, /data-tab="profile"/);
  assert.match(orgHtml, /id="org-lens-list"/);
  assert.match(orgHtml, /id="review-model-options"/);
  assert.match(orgHtml, /id="reasoning-effort"/);
  assert.match(orgHtml, /id="thinking-budget"/);
  assert.match(orgHtml, /id="catalog-status"/);
  assert.match(orgHtml, /id="repo-profile-heading"/);
  assert.match(orgHtml, /class="tab active"/);
  assert.match(orgHtml, /class="choice-badge"/);
  assert.match(orgHtml, /Repository-level switches live under/);
  assert.match(projectHtml, /id="new-repository-default"/);
  assert.match(projectHtml, />Save settings</);
  assert.match(projectHtml, /id="project-enabled"/);
  assert.match(projectHtml, /id="repository-list"/);
  assert.match(projectHtml, /data-tab="about"/);
  assert.match(projectHtml, /data-tab="profile"/);
  assert.match(projectHtml, /id="inherit-profile"/);
  assert.match(projectHtml, /id="project-lens-list"/);
  assert.match(projectHtml, /id="project-model-options"/);
  assert.match(projectHtml, /id="all-model-options"/);
  assert.match(projectHtml, /id="repo-profile-list"/);
  assert.match(projectHtml, /About Masthead in this project/);
  assert.match(projectHtml, /\.\.\/\.\.\/\.\.\/images\/icon-128\.png/);
  assert.match(projectScript, /function activateTab/);
  assert.doesNotMatch(orgHtml + projectHtml, /type="password"/i);
  assert.match(host, /SDK\.init\(\{ loaded: false/);
  assert.match(host, /SDK\.notifyLoadSucceeded\(\)/);
  assert.match(host, /SDK\.notifyLoadFailed/);
  assert.match(orgScript, /saveSetting\("organization"/);
  assert.match(orgScript, /function syncProjectUseState/);
  assert.match(orgScript, /Not used/);
  assert.match(projectScript, /saveSetting\(`project\.\$\{projectId\}`/);
  assert.match(projectScript, /inheritProfile/);
  assert.match(projectScript, /renderRepositoryProfiles/);
  assert.match(projectScript, /fillModelOptions/);
  assert.match(orgScript, /fillModelOptions/);
  assert.match(orgHtml, /Use the organization review profile|Default review profile/);
  const styles = fs.readFileSync(path.join(root, "src/extension/hub/styles.css"), "utf8");
  assert.match(styles, /input\[type="checkbox"\]:checked/);
  assert.match(styles, /background-color: #0e7490/);
  assert.match(styles, /\.project-row\.inactive/);
  assert.match(styles, /\.lens-option/);
  const org = manifest.contributions.find((entry) => entry.targets.includes("ms.vss-web.collection-admin-hub-group"));
  const project = manifest.contributions.find((entry) => entry.targets.includes("ms.vss-web.project-admin-hub-group"));
  assert.equal(org.properties.uri, "dist/extension/hub/index.html");
  assert.equal(project.properties.uri, "dist/extension/project/index.html");
});

test("local packaging has no credentials while publishing requires an ephemeral token", () => {
  const manifest = { id: "masthead-dev", publisher: "f-steff", version: "0.0.1" };
  const create = buildArgs("create", manifest, "manifest.json", {});
  assert.deepEqual(create, ["extension", "create", "--manifest-globs", "manifest.json"]);
  assert.throws(() => buildArgs("publish", manifest, "manifest.json", {}), /token/);
  const publish = buildArgs("publish", manifest, "manifest.json", { TFS_PAT: "test-only-token" });
  assert.ok(publish.includes("--no-wait-validation"));
  assert.equal(publish.at(-1), "test-only-token");
  const validate = buildArgs("validate", manifest, "manifest.json", { TFS_PAT: "test-only-token" });
  assert.ok(validate.includes("--json"));
  assert.ok(validate.includes("--no-color"));
  assert.throws(() => validateArguments("delete", "dev"));
  assert.throws(() => validateArguments("create", "../stable"));
});

test("Marketplace validation polling distinguishes pending, success and failure", () => {
  assert.deepEqual(parseValidationStatus('banner\n{"status":"pending"}\n'), { status: "pending" });
  assert.deepEqual(parseValidationStatus('{"status":"success"}'), { status: "success" });
  assert.deepEqual(
    parseValidationStatus('{"status":"error","message":"Invalid manifest"}'),
    { status: "error", message: "Invalid manifest" }
  );
  assert.throws(() => parseValidationStatus("not json"), /valid JSON/);
});

test("sharing uses repeated arguments and refuses an empty access list", () => {
  const manifest = { id: "masthead-dev", publisher: "f-steff", version: "0.0.1" };
  const env = { TFS_PAT: "test-only-token", ADO_SHARE_ORGS: "contoso, fabrikam" };
  const args = buildArgs("share", manifest, "manifest.json", env);
  assert.equal(args.filter((arg) => arg === "--share-with").length, 2);
  assert.ok(args.includes("contoso"));
  assert.ok(args.includes("fabrikam"));
  assert.throws(() => buildArgs("unshare", manifest, "manifest.json", { TFS_PAT: "test-only-token" }));
});

test("the required build check runs all local gates and packages without live credentials", () => {
  const ci = workflow("ci.yml");
  assert.ok(ci.on.pull_request !== undefined);
  assert.equal(ci.jobs.build["runs-on"], "ubuntu-24.04");
  const commands = ci.jobs.build.steps.map((step) => step.run).filter(Boolean);
  for (const command of ["npm ci", "npm run typecheck", "npm run lint", "npm test", "npm run verify:clean", "npm run build:prod", "npm run package:stable"]) {
    assert.ok(commands.includes(command), command);
  }
  assert.ok(!JSON.stringify(ci).includes("eval:live"));
  assert.equal(ci.permissions.contents, "read");
});

test("the actual release-source workflow allows only same-repository develop releases", () => {
  const guard = workflow("release-guard.yml");
  const step = guard.jobs["release-source"].steps[0];
  const source = /^node <<'NODE'\n([\s\S]*)\nNODE\s*$/.exec(step.run)?.[1];
  assert.ok(source);
  const cases = [
    { BASE: "develop", HEAD: "feature/initial-implementation", HEAD_REPOSITORY: "f-steff/ado-masthead", allowed: true },
    { BASE: "main", HEAD: "feature/initial-implementation", HEAD_REPOSITORY: "f-steff/ado-masthead", allowed: false },
    { BASE: "main", HEAD: "develop", HEAD_REPOSITORY: "f-steff/ado-masthead", allowed: true },
    { BASE: "main", HEAD: "develop", HEAD_REPOSITORY: "someone/fork", allowed: false }
  ];
  for (const fixture of cases) {
    const result = spawnSync(process.execPath, ["-e", source], {
      env: { ...process.env, ...fixture, REPOSITORY: "f-steff/ado-masthead" },
      encoding: "utf8"
    });
    assert.equal(result.status, fixture.allowed ? 0 : 1);
  }
});

test("all Marketplace writes are opt-in, release-branch scoped and OIDC authenticated", () => {
  for (const name of ["publish-dev.yml", "publish-stable.yml", "marketplace.yml", "share-dev.yml"]) {
    const document = workflow(name);
    assert.equal(document.permissions["id-token"], "write");
    for (const job of Object.values(document.jobs)) {
      assert.match(job.if, /MARKETPLACE_PUBLISH_ENABLED == 'true'/);
      assert.match(job.if, /refs\/heads\/(main|develop)/);
    }
  }
  const release = workflow("marketplace.yml");
  assert.equal(release.jobs.publish.environment, "marketplace");
  assert.equal(release.concurrency["cancel-in-progress"], false);
  assert.ok(release.jobs.publish.steps.some((step) => step.uses === "azure/login@v3"));
  assert.ok(!JSON.stringify(release).includes("secrets.MARKETPLACE_PAT"));
});

test("private organization dispatch inputs stay out of public job and run names", () => {
  const share = workflow("share-dev.yml");
  assert.ok(!share["run-name"].includes("inputs.organization"));
  for (const job of Object.values(share.jobs)) {
    for (const step of job.steps) {
      assert.ok(!JSON.stringify(step).includes("inputs.organization"));
    }
  }
});

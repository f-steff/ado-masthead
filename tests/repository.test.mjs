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
import { nextVersion, parseTags, validateVersion } from "../ci/version.mjs";

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

test("the early organization page describes its limits instead of offering fake deployment actions", () => {
  const html = fs.readFileSync(path.join(root, "src/extension/about/index.html"), "utf8");
  assert.match(html, /Masthead/);
  assert.match(html, /does not install service hooks/);
  assert.doesNotMatch(html, /<script|<input|<button/i);
});

test("local packaging has no credentials while publishing requires an ephemeral token", () => {
  const manifest = { id: "masthead-dev", publisher: "f-steff", version: "0.0.1" };
  const create = buildArgs("create", manifest, "manifest.json", {});
  assert.deepEqual(create, ["extension", "create", "--manifest-globs", "manifest.json"]);
  assert.throws(() => buildArgs("publish", manifest, "manifest.json", {}), /token/);
  const publish = buildArgs("publish", manifest, "manifest.json", { TFS_PAT: "test-only-token" });
  assert.ok(publish.includes("--no-wait-validation"));
  assert.equal(publish.at(-1), "test-only-token");
  assert.throws(() => validateArguments("delete", "dev"));
  assert.throws(() => validateArguments("create", "../stable"));
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

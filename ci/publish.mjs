// Run only after the verification/build/OIDC steps. Every write uses validated
// inputs and the short-lived runner token; no credential is persisted in git.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { validateVersion } from "./version.mjs";

/** Keep the helper usable on Windows without npm.cmd or shell quoting rules. */
function run(file, args, options = {}) {
  const result = spawnSync(file, args, { stdio: "inherit", shell: false, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`Release step failed: ${file}`);
  }
  return result;
}

/** Tag publication success, not asynchronous Marketplace validation results. */
function tagRelease(tag) {
  const existing = spawnSync("git", ["rev-parse", "--verify", `refs/tags/${tag}^{commit}`], { encoding: "utf8" });
  if (existing.status === 0) {
    const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
    if (existing.stdout.trim() !== head.stdout.trim()) {
      throw new Error("Release tag already points at another commit.");
    }
    return;
  }
  run("git", ["-c", "user.name=github-actions[bot]", "-c", "user.email=github-actions[bot]@users.noreply.github.com", "tag", "-a", tag, "-m", `Masthead ${process.env.RELEASE_VERSION}`]);
  run("git", ["push", "origin", `refs/tags/${tag}`]);
}

const edition = process.env.EDITION;
if (!["dev", "stable"].includes(edition)) {
  throw new Error("Invalid release edition.");
}
const version = validateVersion(process.env.RELEASE_VERSION ?? "", edition);
const tag = `v${version}`;
if (process.env.RELEASE_TAG !== tag) {
  throw new Error("Release tag and version disagree.");
}
const expectedRef = edition === "dev" ? "refs/heads/develop" : "refs/heads/main";
if (process.env.GITHUB_REF !== expectedRef) {
  throw new Error("Publishing is restricted to the edition's release branch.");
}

// Catch an existing conflicting tag before accepting any Marketplace upload.
const existing = spawnSync("git", ["rev-list", "-n", "1", tag], { encoding: "utf8" });
const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
if (existing.status === 0 && existing.stdout.trim() !== head.stdout.trim()) {
  throw new Error("Requested version is already tagged at another commit.");
}
run(process.execPath, ["scripts/tfx.js", "publish", edition]);
tagRelease(tag);
if (edition === "stable") {
  // Preserve the sequence even if the second upload fails: stable was published and tagged.
  run(process.execPath, ["scripts/tfx.js", "publish", "dev"]);
}

const extension = edition === "dev" ? "masthead-dev" : "masthead";
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Masthead release\n\nPublished ${extension} ${version}; tag ${tag}.\n\n` +
    (edition === "stable" ? "The dev edition carries the same version.\n" : "Tester access is managed separately through Share dev.\n"));
}
// The repository/SHA are supplied by GitHub, never from a PR title or command input.
const status = JSON.stringify({ state: "success", context: `Marketplace: ${extension}`,
  description: `Published Masthead ${version}`, target_url: `https://marketplace.visualstudio.com/items?itemName=f-steff.${extension}` });
run("gh", ["api", "--method", "POST", `repos/${process.env.GITHUB_REPOSITORY}/statuses/${process.env.GITHUB_SHA}`, "--input", "-"], { input: status });

// Both editions share a tag sequence so dev revisions remain relative to the
// latest stable minor, and a stable release publishes the same version twice.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Ignore unrelated tags; only the current 0.x extension sequence is supported. */
export function parseTags(output) {
  const versions = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^v0\.(\d+)\.(\d+)$/.exec(line.trim());
    if (match) {
      versions.push({ minor: Number(match[1]), revision: Number(match[2]) });
    }
  }
  return versions;
}

/** Reuse the released minor for dev; reserve revision zero for stable releases. */
export function nextVersion(edition, tags) {
  if (edition !== "dev" && edition !== "stable") {
    throw new Error("Edition must be dev or stable.");
  }
  const stable = tags.filter((tag) => tag.revision === 0).map((tag) => tag.minor);
  const minor = stable.length ? Math.max(...stable) : 0;
  if (edition === "stable") {
    // Stay monotonic even if an earlier manual publish introduced a later tag.
    return `0.${Math.max(minor, ...tags.map((tag) => tag.minor)) + 1}.0`;
  }
  const revisions = tags.filter((tag) => tag.minor === minor).map((tag) => tag.revision);
  return `0.${minor}.${Math.max(0, ...revisions) + 1}`;
}

/** Validate overrides before they become filenames, tags or workflow outputs. */
export function validateVersion(value, edition) {
  if (edition !== "dev" && edition !== "stable") {
    throw new Error("Edition must be dev or stable.");
  }
  const match = /^0\.(\d+)\.(\d+)$/.exec(value);
  if (!match || (edition === "stable" && Number(match[2]) !== 0)) {
    throw new Error("Expected a 0.x.y version (stable revisions must be zero).");
  }
  return value;
}

/** Write local release inputs without committing computed version changes. */
function writeVersion(edition, version) {
  const file = path.join(root, "ado-manifests", `azure-devops-extension-${edition}.json`);
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.version = version;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
  const packageFile = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  pkg.version = version;
  fs.writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + "\n");
}

// Importing the version helpers in tests must not read git or modify manifests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const edition = process.argv[2];
  const tags = parseTags(execFileSync("git", ["tag", "-l", "v*"], { cwd: root, encoding: "utf8" }));
  const overrideIndex = process.argv.indexOf("--version");
  const requested = overrideIndex < 0 ? undefined : process.argv[overrideIndex + 1];
  if (overrideIndex >= 0 && !requested) {
    throw new Error("--version requires a value.");
  }
  const version = validateVersion(requested ?? nextVersion(edition, tags), edition);
  if (process.argv.includes("--write-all")) {
    writeVersion("stable", version);
    writeVersion("dev", version);
  } else if (process.argv.includes("--write")) {
    writeVersion(edition, version);
  }
  console.log(`version=${version}`);
  console.log(`tag=v${version}`);
}

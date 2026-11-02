// One packaging entry point keeps local builds and CI on the same manifests.
// No command uses a shell, and sharing inputs are never echoed to public logs.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const commands = new Set(["create", "publish", "validate", "share", "unshare"]);

/** Fail before touching files if the command or edition is not recognized. */
function validateArguments(command, edition) {
  if (!commands.has(command) || !["dev", "stable"].includes(edition)) {
    throw new Error("Usage: node scripts/tfx.js <create|publish|validate|share|unshare> <dev|stable>");
  }
}

/** Manifest overrides are deliberately shallow: all edition differences are scalars. */
function mergeManifest(base, override) {
  return { ...base, ...override };
}

/** Build arguments without interpolating credentials or organization names into shell code. */
function buildArgs(command, manifest, generatedPath, env = process.env) {
  const args = ["extension"];
  if (command === "create" || command === "publish") {
    // Publishing must wait for Marketplace validation. Tagging and recording a
    // success before validation finishes makes an unavailable version look live.
    args.push(command, "--manifest-globs", generatedPath);
  } else {
    args.push(command === "validate" ? "isvalid" : command);
    args.push("--publisher", manifest.publisher, "--extension-id", manifest.id);
    if (command === "validate") {
      args.push("--version", manifest.version);
    } else {
      const organizations = (env.ADO_SHARE_ORGS ?? "").split(/[\s,]+/).filter(Boolean);
      if (!organizations.length) {
        throw new Error("Set ADO_SHARE_ORGS to the organizations to share or unshare.");
      }
      const flag = command === "share" ? "--share-with" : "--unshare-with";
      for (const organization of organizations) {
        args.push(flag, organization);
      }
    }
  }
  if (command !== "create") {
    if (!env.TFS_PAT) {
      throw new Error("A short-lived Microsoft Entra publishing token is required.");
    }
    args.push("--auth-type", "pat", "--token", env.TFS_PAT);
  }
  return args;
}

/** Read dispatch inputs directly so a private organization never enters a run name. */
function dispatchEnvironment(env) {
  if (!env.GITHUB_EVENT_PATH) {
    return env;
  }
  const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  const organization = event.inputs?.organization;
  if (!organization) {
    return env;
  }
  if (typeof organization !== "string" || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(organization)) {
    throw new Error("Expected a single Azure DevOps organization name.");
  }
  // Validation excludes newlines, so the mask cannot forge workflow commands.
  console.log(`::add-mask::${organization}`);
  return { ...env, ADO_SHARE_ORGS: organization };
}

/** Importing helpers in tests must not package or publish anything. */
function main() {
  const [command, edition] = process.argv.slice(2);
  validateArguments(command, edition);
  const base = JSON.parse(fs.readFileSync(path.join(root, "ado-manifests/azure-devops-extension-base.json"), "utf8"));
  const override = JSON.parse(fs.readFileSync(path.join(root, `ado-manifests/azure-devops-extension-${edition}.json`), "utf8"));
  const manifest = mergeManifest(base, override);
  const generatedPath = path.join(root, `.generated-${edition}.json`);
  const env = ["share", "unshare"].includes(command) ? dispatchEnvironment(process.env) : process.env;
  const args = buildArgs(command, manifest, generatedPath, env);
  fs.writeFileSync(generatedPath, JSON.stringify(manifest, null, 2) + "\n");
  const packagePath = require.resolve("tfx-cli/package.json");
  const tfx = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const binary = typeof tfx.bin === "string" ? tfx.bin : tfx.bin.tfx;
  const result = spawnSync(process.execPath, [path.resolve(path.dirname(packagePath), binary), ...args], {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env
  });
  if (result.error) {
    throw new Error("Unable to execute the local tfx CLI.");
  }
  process.exitCode = result.status ?? 1;
}

module.exports = { validateArguments, mergeManifest, buildArgs };
if (require.main === module) {
  main();
}

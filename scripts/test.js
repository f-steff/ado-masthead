// Runs the TypeScript test suites through esbuild and Node's test runner.
// Keeping test bundles outside src makes it possible to test pure logic without
// an Azure DevOps host or a live model endpoint.
const esbuild = require("esbuild");
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const outDir = path.join(rootDir, "dist-test");
const testFiles = ["logic.test.ts", "settings.test.ts"].map((name) =>
  path.join(rootDir, "tests", name)
);

// Remove stale bundles so Node never runs an old test suite after a failed build.
fs.rmSync(outDir, { recursive: true, force: true });

esbuild.buildSync({
  entryPoints: testFiles,
  outdir: outDir,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2022",
  entryNames: "[name]",
  outExtension: { ".js": ".mjs" }
});

const result = spawnSync(
  process.execPath,
  [
    "--test",
    ...testFiles.map((file) => path.join(outDir, path.basename(file, ".ts") + ".mjs")),
    path.join(rootDir, "broker", "lib.test.mjs"),
    path.join(rootDir, "tests", "repository.test.mjs")
  ],
  { stdio: "inherit" }
);
if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);

// Bundles the review engine for local use and future extension/worker consumers.
// The informational extension shell makes early VSIX packages inspectable; it
// deliberately performs no deployment or review actions.
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--mode=production");
const rootDir = path.join(__dirname, "..");
const distDir = path.join(rootDir, "dist");

fs.rmSync(distDir, { recursive: true, force: true });

esbuild.buildSync({
  entryPoints: [path.join(rootDir, "src", "index.ts")],
  outfile: path.join(distDir, "core", "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2022",
  sourcemap: !production,
  minify: production
});

// The central pipeline runs this entry point with SYSTEM_ACCESSTOKEN and the
// linked provider secret variables. It is intentionally not part of the browser
// extension bundle.
fs.mkdirSync(path.join(distDir, "worker"), { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(rootDir, "src", "worker", "review-pr.ts")],
  outfile: path.join(distDir, "worker", "review-pr.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2022",
  sourcemap: !production,
  minify: production
});

// The hub is a browser bundle because it must complete the Azure DevOps host
// handshake before the host stops showing its loading indicator.
const hubSource = path.join(rootDir, "src", "extension", "hub");
const hubDirectory = path.join(distDir, "extension", "hub");
fs.mkdirSync(hubDirectory, { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(hubSource, "index.ts")],
  outfile: path.join(hubDirectory, "index.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  sourcemap: !production,
  minify: production
});
for (const file of ["index.html", "styles.css"]) {
  fs.copyFileSync(path.join(hubSource, file), path.join(hubDirectory, file));
}

// Project settings is a separate contribution so repository gating stays in
// the project administration surface rather than the organization page.
const projectSource = path.join(rootDir, "src", "extension", "project");
const projectDirectory = path.join(distDir, "extension", "project");
fs.mkdirSync(projectDirectory, { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(projectSource, "index.ts")],
  outfile: path.join(projectDirectory, "index.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  sourcemap: !production,
  minify: production
});
fs.copyFileSync(path.join(projectSource, "index.html"), path.join(projectDirectory, "index.html"));

console.log(`Built review core${production ? " (production)" : ""}.`);

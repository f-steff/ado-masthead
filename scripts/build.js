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

// Keep the first package honest: show implementation status, not nonfunctional setup controls.
const aboutDirectory = path.join(distDir, "extension", "about");
fs.mkdirSync(aboutDirectory, { recursive: true });
fs.copyFileSync(
  path.join(rootDir, "src", "extension", "about", "index.html"),
  path.join(aboutDirectory, "index.html")
);

console.log(`Built review core${production ? " (production)" : ""}.`);

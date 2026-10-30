// Project checks for docs and source that must remain publishable.
// Paths containing local browser profiles and generated output are excluded.
const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const ignoredDirectories = new Set([".git", ".opencode", "node_modules", "dist", "dist-test"]);
const ignoredExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".vsix"]);
const patterns = [
  { name: "Windows user path", expression: /C:\\Users\\[^\\\s]+/i },
  { name: "private key", expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "GitHub token", expression: /\b(?:ghp|gho|ghu|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { name: "OpenAI-style key", expression: /\bsk-[A-Za-z0-9_-]{20,}\b/ }
];

const findings = [];
walk(rootDir);

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.path}: ${finding.name}`);
  }
  process.exit(1);
}

console.log("Identifier scan passed.");

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (ignoredExtensions.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }
    if (entry.name === "package-lock.json") {
      continue;
    }
    scanFile(fullPath);
  }
}

function scanFile(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const pattern of patterns) {
    if (pattern.expression.test(text)) {
      findings.push({ path: path.relative(rootDir, filePath), name: pattern.name });
    }
  }
}

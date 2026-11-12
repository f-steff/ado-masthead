// Bounded candidate discovery for unchanged related files. This is not a
// semantic index: it follows relative script imports and common nearby test
// names. The caller fetches only candidates that exist at the fixed commit.
import { posix as path } from "node:path";
import { ReviewChangedFile } from "./types";

const SCRIPT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

/** Return deterministic, repository-relative candidates, never changed files. */
export function relatedFileCandidates(changedFiles: readonly ReviewChangedFile[]): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const changed = new Set(changedFiles.map((file) => normalizeRelative(file.path)).filter(isString));
  const add = (value: string | undefined): void => {
    if (!value || changed.has(value) || seen.has(value)) return;
    seen.add(value);
    candidates.push(value);
  };

  for (const file of changedFiles) {
    if (file.changeType === "delete" || !file.content) continue;
    const changedPath = normalizeRelative(file.path);
    if (!changedPath) continue;
    if (isScript(changedPath)) {
      for (const specifier of scriptSpecifiers(file.content)) {
        for (const resolved of resolveScriptSpecifier(changedPath, specifier)) add(resolved);
      }
      for (const testPath of scriptTestCandidates(changedPath)) add(testPath);
    } else if (changedPath.endsWith(".py")) {
      for (const specifier of pythonSpecifiers(file.content)) {
        for (const resolved of resolvePythonSpecifier(changedPath, specifier.level, specifier.module)) add(resolved);
      }
      for (const testPath of pythonTestCandidates(changedPath)) add(testPath);
    }
  }
  return candidates;
}

/** Keep paths inside the repository and in POSIX form for ADO item requests. */
export function normalizeRelative(value: string): string | undefined {
  const slash = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!slash || /[\u0000-\u001f]/.test(slash)) return undefined;
  const normalized = path.normalize(slash);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || path.isAbsolute(normalized)) {
    return undefined;
  }
  return normalized;
}

function scriptSpecifiers(content: string): string[] {
  const values: string[] = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1] && !values.includes(match[1])) values.push(match[1]);
    }
  }
  return values;
}

function resolveScriptSpecifier(from: string, specifier: string): string[] {
  if (!specifier.startsWith(".") || /[?#]/.test(specifier)) return [];
  const base = normalizeRelative(path.join(path.dirname(from), specifier));
  if (!base) return [];
  const extension = path.extname(base);
  const candidates: string[] = [];
  if (extension) {
    candidates.push(base);
    // TypeScript commonly imports the emitted .js name; try source extensions too.
    if (SCRIPT_EXTENSIONS.includes(extension) && extension !== ".ts") {
      const stem = base.slice(0, -extension.length);
      for (const alternative of SCRIPT_EXTENSIONS) candidates.push(`${stem}${alternative}`);
    }
  } else {
    for (const alternative of SCRIPT_EXTENSIONS) candidates.push(`${base}${alternative}`);
    for (const alternative of SCRIPT_EXTENSIONS) candidates.push(`${base}/index${alternative}`);
  }
  return [...new Set(candidates)];
}

function scriptTestCandidates(file: string): string[] {
  const extension = path.extname(file);
  if (!SCRIPT_EXTENSIONS.includes(extension)) return [];
  const base = file.slice(0, -extension.length);
  if (/\.(test|spec)$/.test(base) || file.includes("/__tests__/")) return [];
  const directory = path.dirname(file);
  const name = path.basename(base);
  return [
    `${base}.test${extension}`,
    `${base}.spec${extension}`,
    `${directory}/__tests__/${name}.test${extension}`,
    `${directory}/__tests__/${name}.spec${extension}`
  ];
}

function pythonSpecifiers(content: string): Array<{ level: number; module: string }> {
  const values: Array<{ level: number; module: string }> = [];
  const fromPattern = /\bfrom\s+(\.+)([A-Za-z_][\w.]*)?\s+import\b/g;
  for (const match of content.matchAll(fromPattern)) {
    values.push({ level: match[1].length, module: match[2] ?? "" });
  }
  const directPattern = /\bimport\s+(\.+)([A-Za-z_][\w.]*)/g;
  for (const match of content.matchAll(directPattern)) {
    values.push({ level: match[1].length, module: match[2] });
  }
  return values;
}

function resolvePythonSpecifier(from: string, level: number, module: string): string[] {
  let base = path.dirname(from);
  for (let index = 1; index < level; index += 1) {
    base = path.dirname(base);
  }
  const target = normalizeRelative(path.join(base, module.replace(/\./g, "/")));
  if (!target) return [];
  return [`${target}.py`, `${target}/__init__.py`];
}

function pythonTestCandidates(file: string): string[] {
  if (!file.endsWith(".py")) return [];
  const base = file.slice(0, -3);
  const name = path.basename(base);
  if (name.startsWith("test_") || name.endsWith("_test")) return [];
  const directory = path.dirname(file);
  return [
    `${directory}/test_${name}.py`,
    `${directory}/${name}_test.py`,
    `${directory}/tests/test_${name}.py`
  ];
}

function isScript(file: string): boolean {
  return SCRIPT_EXTENSIONS.includes(path.extname(file));
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}

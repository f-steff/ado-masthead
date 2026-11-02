// Model output is data, not authority to publish. Validate shape, selected
// lenses and repository paths before a later publisher can see the result.
import { REVIEW_LENS_BY_ID, ReviewLensId } from "./lenses";
import { RepositoryLicense, ReviewFinding, ReviewGuide, ReviewResult } from "./types";

const MISSING_LICENSE_ID = "repository-license-missing";
const SEVERITIES = new Set(["critical", "major", "minor", "warning", "info"]);
const CONFIDENCES = new Set(["high", "medium", "low"]);

export interface ResultValidation {
  enabledLenses?: readonly ReviewLensId[];
  allowedFiles?: readonly string[];
  requireGuide?: boolean;
}

/** Never let an absolute path, URL or traversal become a PR comment anchor. */
export function repositoryPath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (!normalized || normalized.startsWith("/") || /[\x00-\x1f\x7f:]/.test(normalized) ||
      segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Expected a repository-relative file path.");
  }
  return normalized;
}

/** Add exactly one trusted warning without hiding unrelated attribution findings. */
export function applyRepositoryLicenseWarning(
  result: ReviewResult,
  license: RepositoryLicense,
  enabled = true
): ReviewResult {
  if (!enabled || !license.missing) {
    return result;
  }
  const retained = result.findings.filter((finding) => {
    const canonical = finding.id === MISSING_LICENSE_ID;
    const rootWarning = finding.lens === "license" && finding.file === "LICENSE";
    return !canonical && !rootWarning;
  });
  const warning: ReviewFinding = {
    id: MISSING_LICENSE_ID,
    lens: "license",
    severity: "warning",
    confidence: "high",
    file: "LICENSE",
    scope: "repository",
    title: "Repository has no root LICENSE file",
    body: "No root LICENSE file was found. Add a license or confirm the intended repository policy.",
    suggestion: "Add a root LICENSE file that describes the repository policy."
  };
  return { ...result, findings: [warning, ...retained] };
}

/** Invalid output is a failed analysis, never an empty successful review. */
export function parseReviewResult(raw: string, validation: ResultValidation = {}): ReviewResult {
  if (raw.length > 2_000_000) {
    throw new Error("Review response exceeds the supported size.");
  }
  const text = raw.trim();
  const fenced = /^```json\s*([\s\S]*?)\s*```$/i.exec(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fenced ? fenced[1] : text);
  } catch {
    throw new Error("Review response was not valid JSON.");
  }
  if (!isRecord(parsed) || !stringValue(parsed.summary) || !Array.isArray(parsed.findings)) {
    throw new Error("Review response does not match the result shape.");
  }
  if (parsed.findings.length > 100) {
    throw new Error("Review response has too many findings.");
  }
  const allowed = validation.allowedFiles ? new Set(validation.allowedFiles.map(repositoryPath)) : undefined;
  const ids = new Set<string>();
  const findings = parsed.findings.map((value, index) => {
    const finding = parseFinding(value, index);
    if (ids.has(finding.id)) {
      throw new Error("Review response contains duplicate finding IDs.");
    }
    ids.add(finding.id);
    if (validation.enabledLenses && !validation.enabledLenses.includes(finding.lens as ReviewLensId)) {
      throw new Error("Review response used a disabled lens.");
    }
    if (allowed && !allowed.has(finding.file)) {
      throw new Error("Review response references a file outside the supplied context.");
    }
    return finding;
  });
  const guide = parsed.guide === undefined ? undefined : parseGuide(parsed.guide);
  if (validation.requireGuide && !guide) {
    throw new Error("Review response is missing the requested review guide.");
  }
  if (allowed && guide?.readingOrder.some((file) => !allowed.has(repositoryPath(file)))) {
    throw new Error("Review guide references a file outside the supplied context.");
  }
  return { summary: stringValue(parsed.summary), findings, ...(guide ? { guide } : {}) };
}

/** Preserve deliberate file-level findings; reject bad coordinates rather than hiding them. */
function parseFinding(value: unknown, index: number): ReviewFinding {
  if (!isRecord(value)) {
    throw new Error(`Finding ${index} is not an object.`);
  }
  if (!SEVERITIES.has(stringValue(value.severity))) {
    throw new Error(`Finding ${index} has an invalid severity.`);
  }
  if (!CONFIDENCES.has(stringValue(value.confidence))) {
    throw new Error(`Finding ${index} has an invalid confidence.`);
  }
  for (const field of ["id", "lens", "file", "title", "body"]) {
    if (!stringValue(value[field])) {
      throw new Error(`Finding ${index} is missing ${field}.`);
    }
  }
  if (!REVIEW_LENS_BY_ID.has(stringValue(value.lens) as ReviewLensId)) {
    throw new Error(`Finding ${index} has an unknown lens.`);
  }
  const line = value.line === undefined ? undefined : Number(value.line);
  if (typeof value.line === "string" && !/^[1-9]\d*$/.test(value.line)) {
    throw new Error(`Finding ${index} has an invalid line.`);
  }
  if (line !== undefined && (!Number.isSafeInteger(line) || line <= 0 ||
      !["number", "string"].includes(typeof value.line))) {
    throw new Error(`Finding ${index} has an invalid line.`);
  }
  return {
    id: stringValue(value.id),
    lens: stringValue(value.lens),
    severity: stringValue(value.severity) as ReviewFinding["severity"],
    confidence: stringValue(value.confidence) as ReviewFinding["confidence"],
    file: repositoryPath(stringValue(value.file)),
    ...(line === undefined ? {} : { line }),
    title: stringValue(value.title),
    body: stringValue(value.body),
    ...(stringValue(value.suggestion) ? { suggestion: stringValue(value.suggestion) } : {})
  };
}

/** Keep a guide structured so UI rendering never needs to interpret model HTML. */
function parseGuide(value: unknown): ReviewGuide {
  if (!isRecord(value) || !stringValue(value.intent)) {
    throw new Error("Review guide has no intent.");
  }
  for (const field of ["readingOrder", "attention", "verification"]) {
    const list = value[field];
    if (!Array.isArray(list) || !list.every((item) => typeof item === "string" && item.trim())) {
      throw new Error("Review guide has an invalid list.");
    }
  }
  return {
    intent: stringValue(value.intent),
    readingOrder: (value.readingOrder as string[]).map(repositoryPath),
    attention: [...value.attention as string[]],
    verification: [...value.verification as string[]]
  };
}

/** Avoid coercing model objects into publishable strings. */
function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Distinguish JSON records from arrays and null before reading properties. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

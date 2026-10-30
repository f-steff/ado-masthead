// Parses the model's JSON result without trusting it. A malformed result is a
// review failure, not silently presented as an empty successful review.
import { RepositoryLicense } from "./types";
import { FindingConfidence, FindingSeverity, ReviewFinding, ReviewResult } from "./types";

const MISSING_LICENSE_ID = "repository-license-missing";

const SEVERITIES = new Set<FindingSeverity>([
  "critical",
  "major",
  "minor",
  "warning",
  "info"
]);
const CONFIDENCES = new Set<FindingConfidence>(["high", "medium", "low"]);

/**
 * Adds the agreed repository-level warning when the target has no LICENSE.
 * This is deterministic so a model cannot omit or repeat the warning per file.
 */
export function applyRepositoryLicenseWarning(
  result: ReviewResult,
  license: RepositoryLicense
): ReviewResult {
  if (!license.missing) {
    return result;
  }

  const alreadyReported = result.findings.some(
    (finding) =>
      finding.id === MISSING_LICENSE_ID ||
      (finding.lens === "license" && /missing|no root license/i.test(finding.title))
  );
  if (alreadyReported) {
    return result;
  }

  const warning: ReviewFinding = {
    id: MISSING_LICENSE_ID,
    lens: "license",
    severity: "warning",
    confidence: "high",
    file: "LICENSE",
    title: "Repository has no root LICENSE file",
    body:
      license.warning ??
      "No root LICENSE file was found. Add a license or confirm the intended repository policy.",
    suggestion: "Add a root LICENSE file that describes the repository policy."
  };

  return { ...result, findings: [warning, ...result.findings] };
}

export function parseReviewResult(raw: string): ReviewResult {
  const candidate = extractJsonObject(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error("Review response was not valid JSON.");
  }

  if (!isRecord(parsed) || typeof parsed.summary !== "string" || !Array.isArray(parsed.findings)) {
    throw new Error("Review response does not match the result shape.");
  }

  const findings = parsed.findings.map((value, index) => parseFinding(value, index));
  return { summary: parsed.summary.trim(), findings };
}

function parseFinding(value: unknown, index: number): ReviewFinding {
  if (!isRecord(value)) {
    throw new Error(`Finding ${index} is not an object.`);
  }

  const severity = stringValue(value.severity);
  const confidence = stringValue(value.confidence);
  if (!SEVERITIES.has(severity as FindingSeverity)) {
    throw new Error(`Finding ${index} has an invalid severity.`);
  }
  if (!CONFIDENCES.has(confidence as FindingConfidence)) {
    throw new Error(`Finding ${index} has an invalid confidence.`);
  }

  const lineValue = value.line;
  const line =
    typeof lineValue === "number" && Number.isInteger(lineValue) && lineValue > 0
      ? lineValue
      : typeof lineValue === "string" && /^\d+$/.test(lineValue)
        ? Number(lineValue)
        : undefined;

  const requiredFields = ["id", "lens", "file", "title", "body"] as const;
  for (const field of requiredFields) {
    if (!stringValue(value[field])) {
      throw new Error(`Finding ${index} is missing ${field}.`);
    }
  }

  return {
    id: stringValue(value.id),
    lens: stringValue(value.lens),
    severity: severity as FindingSeverity,
    confidence: confidence as FindingConfidence,
    file: stringValue(value.file),
    line,
    title: stringValue(value.title),
    body: stringValue(value.body),
    suggestion: stringValue(value.suggestion) || undefined
  };
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fenced ? fenced[1].trim() : trimmed;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Review response did not contain a JSON object.");
  }
  return text.slice(start, end + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

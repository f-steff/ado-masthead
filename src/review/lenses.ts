// Defines the review lenses and their defaults. Keeping this data separate from
// prompt text makes configuration, documentation and tests use one source of truth.
export type ReviewLensId =
  | "correctness"
  | "security"
  | "tests"
  | "license"
  | "performance"
  | "maintainability"
  | "data"
  | "dependencies";

export interface ReviewLensDefinition {
  id: ReviewLensId;
  name: string;
  summary: string;
  defaultEnabled: boolean;
  /** Correctness is the baseline and cannot be disabled. */
  mandatory: boolean;
  /** Paths that make this lens worth suggesting to the user. */
  suggestedPathPatterns: string[];
  checks: string[];
  ignore: string[];
}

export interface ReviewProfile {
  enabledLenses: ReviewLensId[];
  reviewGuide: boolean;
}

export const REVIEW_LENSES: readonly ReviewLensDefinition[] = [
  {
    id: "correctness",
    name: "Correctness and impact",
    summary: "Defects in the changed behavior and the code directly affected by it.",
    defaultEnabled: true,
    mandatory: true,
    suggestedPathPatterns: [],
    checks: [
      "logic errors, inverted conditions, off-by-one errors and missing null handling",
      "async ordering, missing awaits and swallowed errors",
      "removed guards or behavior that the change does not restore",
      "direct callers, contracts and data shapes affected by the change",
      "edge cases supported by a concrete failure path"
    ],
    ignore: [
      "pre-existing code that the change does not affect",
      "style preferences and speculative concerns without a trigger"
    ]
  },
  {
    id: "security",
    name: "Security and privacy",
    summary: "Security-sensitive behavior introduced or made reachable by the change.",
    defaultEnabled: true,
    mandatory: false,
    suggestedPathPatterns: [
      "**/auth/**",
      "**/security/**",
      "**/*.sql",
      "**/*.cs",
      "**/*.ts",
      "**/*.js",
      "**/*.py"
    ],
    checks: [
      "injection, authorization and authentication mistakes",
      "unsafe handling of secrets, credentials and personal data",
      "unsafe deserialization, path handling and shell construction",
      "missing validation at trust boundaries"
    ],
    ignore: [
      "generic hardening that is unrelated to the changed behavior",
      "dependency vulnerability claims without evidence"
    ]
  },
  {
    id: "tests",
    name: "Tests and verification",
    summary: "Whether behavior changes are covered by meaningful tests.",
    defaultEnabled: true,
    mandatory: false,
    suggestedPathPatterns: ["**/*.test.*", "**/*.spec.*", "**/tests/**"],
    checks: [
      "new behavior without a test that exercises it",
      "tests weakened, skipped or disconnected from their assertions",
      "missing edge cases for a changed failure mode",
      "tests that assert implementation details instead of behavior"
    ],
    ignore: [
      "missing tests for renames, formatting or mechanical changes",
      "requests for coverage percentages that do not indicate risk"
    ]
  },
  {
    id: "license",
    name: "License and provenance",
    summary: "License obligations, copied code and missing provenance in the reviewed repository.",
    defaultEnabled: true,
    mandatory: false,
    suggestedPathPatterns: [
      "LICENSE",
      "NOTICE",
      "**/vendor/**",
      "**/third_party/**",
      "**/third-party/**",
      "**/external/**",
      "**/package.json",
      "**/package-lock.json",
      "**/*.csproj",
      "**/*.props",
      "**/*.targets"
    ],
    checks: [
      "the target repository's declared license and missing LICENSE",
      "license headers, SPDX identifiers and copyright statements",
      "vendored, copied or generated files with separate terms",
      "dependency and asset license obligations",
      "attribution or notice obligations"
    ],
    ignore: [
      "definitive legal conclusions, including that distribution is unlawful or definitely incompatible",
      "accusations that code was copied without provenance evidence"
    ]
  },
  {
    id: "performance",
    name: "Performance and scalability",
    summary: "Changed work that is measurably wasteful or scales poorly.",
    defaultEnabled: false,
    mandatory: false,
    suggestedPathPatterns: ["**/*repository*", "**/*service*"],
    checks: [
      "unbounded queries or work proportional to unexpected input",
      "blocking I/O on a hot path",
      "repeated work that should be computed once",
      "avoidable allocations or round trips with a concrete impact"
    ],
    ignore: [
      "micro-optimizations without a plausible workload",
      "theoretical concurrency concerns without a specific interleaving"
    ]
  },
  {
    id: "maintainability",
    name: "Maintainability",
    summary: "Changes that make the changed code materially harder to understand or change.",
    defaultEnabled: false,
    mandatory: false,
    suggestedPathPatterns: [],
    checks: [
      "duplicated logic where an existing helper applies",
      "confusing control flow introduced by the change",
      "misleading or missing error context",
      "documentation that contradicts the changed behavior"
    ],
    ignore: [
      "naming preference, formatting and import ordering",
      "broad refactoring unrelated to the change"
    ]
  },
  {
    id: "data",
    name: "Data and migration safety",
    summary: "Schema changes and data movement that may lose data or fail during rollout.",
    defaultEnabled: false,
    mandatory: false,
    suggestedPathPatterns: [
      "**/migrations/**",
      "**/migration/**",
      "**/*.sql",
      "**/schema.*",
      "**/alembic.ini"
    ],
    checks: [
      "data loss, destructive changes and unsafe backfills",
      "migration ordering, rollback and deployment compatibility",
      "locking or long-running operations with a concrete risk",
      "code and schema deployed in an incompatible order"
    ],
    ignore: [
      "migration style preferences",
      "concerns that assume an environment or data volume not in evidence"
    ]
  },
  {
    id: "dependencies",
    name: "Dependencies and infrastructure",
    summary: "New packages, build configuration and infrastructure changes with operational impact.",
    defaultEnabled: false,
    mandatory: false,
    suggestedPathPatterns: [
      "**/package.json",
      "**/package-lock.json",
      "**/*.csproj",
      "**/Directory.Packages.props",
      "**/Dockerfile",
      "**/docker-compose*.yml",
      "**/*.tf",
      "**/*.bicep",
      "**/azure-pipelines*.yml"
    ],
    checks: [
      "dependency additions or upgrades with a concrete compatibility risk",
      "untrusted install or build steps",
      "infrastructure changes with a deployment or security consequence",
      "configuration that can break existing environments"
    ],
    ignore: [
      "requests to update unrelated dependencies",
      "generic supply-chain warnings without a changed package or build path"
    ]
  }
] as const;

export const REVIEW_LENS_BY_ID: ReadonlyMap<ReviewLensId, ReviewLensDefinition> = new Map(
  REVIEW_LENSES.map((lens) => [lens.id, lens])
);

const ALL_REVIEW_LENS_IDS = new Set<ReviewLensId>(REVIEW_LENSES.map((lens) => lens.id));

export function defaultReviewProfile(): ReviewProfile {
  return {
    enabledLenses: REVIEW_LENSES.filter((lens) => lens.defaultEnabled).map((lens) => lens.id),
    reviewGuide: true
  };
}

export function resolveReviewProfile(
  requested: Partial<ReviewProfile> | undefined
): ReviewProfile {
  const merged = { ...defaultReviewProfile(), ...requested };
  const requestedIds = Array.isArray(merged.enabledLenses) ? merged.enabledLenses : [];
  const selected = new Set<ReviewLensId>();

  for (const id of requestedIds) {
    if (!ALL_REVIEW_LENS_IDS.has(id)) {
      throw new Error(`Unknown review lens: ${String(id)}`);
    }
    selected.add(id);
  }

  const mandatory = REVIEW_LENSES.filter((lens) => lens.mandatory).map((lens) => lens.id);
  for (const id of mandatory) {
    selected.add(id);
  }

  return {
    enabledLenses: REVIEW_LENSES.filter((lens) => selected.has(lens.id)).map((lens) => lens.id),
    reviewGuide: merged.reviewGuide !== false
  };
}

export function suggestedLensesForPaths(paths: readonly string[]): ReviewLensId[] {
  const suggestions = new Set<ReviewLensId>();
  for (const lens of REVIEW_LENSES) {
    if (lens.defaultEnabled || lens.suggestedPathPatterns.length === 0) {
      continue;
    }
    if (paths.some((path) => lens.suggestedPathPatterns.some((pattern) => pathMatches(pattern, path)))) {
      suggestions.add(lens.id);
    }
  }
  return [...suggestions];
}

function pathMatches(pattern: string, path: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/").toLowerCase();
  // A leading "**/" means "any folder depth", including the repository root.
  const normalizedPattern = pattern.toLowerCase().replace(/^\*\*\//, "");
  const escaped = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__DOUBLE_STAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/__DOUBLE_STAR__/g, ".*");
  return new RegExp(`^${escaped}$`).test(normalizedPath);
}

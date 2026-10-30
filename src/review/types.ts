// Shared result types for a review. A review always returns structured findings;
// the UI and PR publisher must not depend on parsing prose.
export type FindingSeverity = "critical" | "major" | "minor" | "warning" | "info";
export type FindingConfidence = "high" | "medium" | "low";

export interface ReviewFinding {
  /** Stable across re-reviews when the underlying issue is unchanged. */
  id: string;
  lens: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  file: string;
  line?: number;
  title: string;
  body: string;
  suggestion?: string;
}

export interface ReviewResult {
  summary: string;
  findings: ReviewFinding[];
}

export interface ReviewInput {
  title: string;
  description?: string;
  changedFiles: ReviewChangedFile[];
  repositoryLicense?: RepositoryLicense;
  context?: string;
}

export interface ReviewChangedFile {
  path: string;
  changeType: "add" | "edit" | "delete" | "rename";
  diff?: string;
  content?: string;
}

export interface RepositoryLicense {
  path?: string;
  text?: string;
  missing: boolean;
  warning?: string;
}

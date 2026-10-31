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
  /** Only trusted worker-generated warnings use repository scope. */
  scope?: "repository";
}

export interface ReviewResult {
  summary: string;
  findings: ReviewFinding[];
  guide?: ReviewGuide;
}

export interface ReviewGuide {
  intent: string;
  readingOrder: string[];
  attention: string[];
  verification: string[];
}

export interface ReviewInput {
  title: string;
  description?: string;
  changedFiles: ReviewChangedFile[];
  repositoryLicense?: RepositoryLicense;
  context?: string;
  relatedFiles?: Array<{ path: string; content: string }>;
  previousFindings?: Array<{
    finding: ReviewFinding;
    state: "active" | "resolved" | "dismissed";
  }>;
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

// Azure DevOps threads are the durable review store. Metadata is encoded in a
// bot-authored HTML comment so a later run can recover finding identity without
// a database. The marker is never trusted on its own: the comment author must
// still match the authenticated Masthead identity.
import { parseReviewResult } from "../review/result";
import { ReviewFinding } from "../review/types";
import { ReviewRevision, StoredFinding } from "../review/lifecycle";
import { AdoComment, AdoThread, AdoThreadStatus } from "./types";

const MARKER_PREFIX = "<!-- masthead:1:";
const MARKER_PATTERN = /^\s*<!-- masthead:1:([A-Za-z0-9_-]+) -->/;
const OWNER_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const REVISION_PATTERN = /^[A-Za-z0-9:._-]{1,200}$/;
const MAX_METADATA_LENGTH = 100_000;

export type PersistedFindingState = "active" | "bot-fixed" | "bot-withdrawn";

export interface FindingThreadMetadata {
  version: 1;
  kind: "finding";
  finding: ReviewFinding;
  ownerId: string;
  revision: ReviewRevision;
  state: PersistedFindingState;
}

/** Keep the marker compact and safe for ADO markdown comments. */
export function encodeFindingMetadata(metadata: FindingThreadMetadata): string {
  const serialized = JSON.stringify(metadata);
  if (serialized.length > MAX_METADATA_LENGTH) {
    throw new Error("Finding metadata is too large to publish.");
  }
  return `${MARKER_PREFIX}${Buffer.from(serialized, "utf8").toString("base64url")} -->`;
}

/**
 * Decode only a complete marker. A malformed or oversized marker is ignored
 * rather than treated as a finding owned by Masthead.
 */
export function decodeFindingMetadata(content: string): FindingThreadMetadata | undefined {
  if (content.length > MAX_METADATA_LENGTH * 2) {
    return undefined;
  }
  const match = MARKER_PATTERN.exec(content);
  if (!match) {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  if (!isRecord(value) || value.version !== 1 || value.kind !== "finding" ||
      typeof value.ownerId !== "string" || !OWNER_PATTERN.test(value.ownerId) ||
      !isRecord(value.revision) || typeof value.revision.source !== "string" ||
      typeof value.revision.target !== "string" || !REVISION_PATTERN.test(value.revision.source) ||
      !REVISION_PATTERN.test(value.revision.target) ||
      !["active", "bot-fixed", "bot-withdrawn"].includes(String(value.state))) {
    return undefined;
  }
  const finding = parseMetadataFinding(value.finding);
  if (!finding) {
    return undefined;
  }
  return {
    version: 1,
    kind: "finding",
    finding,
    ownerId: value.ownerId,
    revision: { source: value.revision.source, target: value.revision.target },
    state: value.state as PersistedFindingState
  };
}

/** Render the human-readable comment while keeping the marker on its own line. */
export function renderFindingComment(metadata: FindingThreadMetadata): string {
  const finding = metadata.finding;
  const suggestion = finding.suggestion
    ? `\n\n**Suggested change:** ${escapeHtml(finding.suggestion)}`
    : "";
  const anchor = finding.line ? `:${finding.line}` : "";
  return `${encodeFindingMetadata(metadata)}

**Masthead ${escapeHtml(finding.severity)} finding** - ${escapeHtml(finding.lens)}

### ${escapeHtml(finding.title)}

${escapeHtml(finding.body)}${suggestion}

<sub>Finding \`${escapeHtml(finding.id)}\` in \`${escapeHtml(finding.file)}${anchor}\`. This comment is advisory and does not approve or merge the pull request.</sub>`;
}

/** A resolution note carries the state transition so a later run can distinguish
 * a bot fix from a human resolution. */
export function renderResolutionComment(
  metadata: FindingThreadMetadata,
  reason: string
): string {
  const verb = metadata.state === "bot-fixed" ? "resolved" : "withdrawn";
  return `${encodeFindingMetadata(metadata)}

**Masthead ${verb} this finding.**

${escapeHtml(reason)}

<sub>Finding \`${escapeHtml(metadata.finding.id)}\` at source \`${escapeHtml(metadata.revision.source)}\` and target \`${escapeHtml(metadata.revision.target)}\`.</sub>`;
}

/** Recover findings from threads, accepting markers only from the bot identity. */
export function storedFindingsFromThreads(
  threads: readonly AdoThread[],
  botId: string
): StoredFinding[] {
  if (!botId) {
    throw new Error("Masthead identity is required.");
  }
  const stored: StoredFinding[] = [];
  for (const thread of threads) {
    const items: Array<{ comment: AdoComment; metadata: FindingThreadMetadata }> = [];
    for (const comment of thread.comments) {
      if (comment.author?.id !== botId || typeof comment.content !== "string") continue;
      const metadata = decodeFindingMetadata(comment.content);
      if (metadata) items.push({ comment, metadata });
    }
    items.sort((left, right) => left.comment.id - right.comment.id);
    const latest = items.at(-1);
    if (!latest) continue;
    const state = persistedState(thread.status, latest.metadata.state);
    stored.push({
      finding: latest.metadata.finding,
      threadId: thread.id,
      ownerId: botId,
      state
    });
  }
  return stored;
}

/** Map ADO thread status to lifecycle state without reopening human decisions. */
export function persistedState(
  status: AdoThreadStatus,
  markerState: PersistedFindingState
): StoredFinding["state"] {
  if (markerState === "bot-fixed") return "bot-fixed";
  if (markerState === "bot-withdrawn") return "bot-withdrawn";
  if (status === "active" || status === "pending" || status === "unknown") return "active";
  if (status === "fixed") return "human-resolved";
  return "dismissed";
}

/** Keep model text from injecting raw HTML into an ADO comment. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Validate a marker's finding as data; repository scope is allowed only because
 * the marker was already authenticated as bot-authored. */
function parseMetadataFinding(value: unknown): ReviewFinding | undefined {
  if (!isRecord(value)) return undefined;
  try {
    const parsed = parseReviewResult(JSON.stringify({
      summary: "metadata",
      findings: [value]
    }));
    const finding = parsed.findings[0];
    if (!finding) return undefined;
    return value.scope === "repository" ? { ...finding, scope: "repository" } : finding;
  } catch {
    return undefined;
  }
}

/** Reject arrays and null before reading protocol fields. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

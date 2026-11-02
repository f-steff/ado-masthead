// Plans are side-effect free. A future publisher must re-fetch the current
// revision/ownership, execute actions, then persist only successfully applied changes.
import { createHash } from "node:crypto";
import { ReviewFinding, ReviewResult } from "./types";

export interface ReviewRevision {
  source: string;
  target: string;
}

export interface StoredFinding {
  finding: ReviewFinding;
  threadId: number;
  ownerId: string;
  state: "active" | "bot-fixed" | "bot-withdrawn" | "human-resolved" | "dismissed";
}

export interface FindingVerification {
  findingId: string;
  outcome: "fixed" | "withdrawn" | "still-present" | "unverified";
  revision: ReviewRevision;
  reason: string;
}

export type ReviewAction =
  | { kind: "add"; finding: ReviewFinding; priorThreadId?: number }
  | { kind: "resolve" | "withdraw"; findingId: string; threadId: number; reason: string };

export interface ReconciliationPlan {
  stale: boolean;
  actions: ReviewAction[];
  openFindingIds: string[];
  summary: string;
}

/** Target changes can invalidate a result even when the PR's source SHA is unchanged. */
export function sameRevision(left: ReviewRevision, right: ReviewRevision): boolean {
  return left.source === right.source && left.target === right.target;
}

/**
 * Verification is explicit evidence supplied by a code-aware check, not inferred
 * from absence in the model's latest findings. This policy validates freshness
 * and ownership; it does not itself prove that a code change fixes an issue.
 */
export function reconcileFindings(
  previous: readonly StoredFinding[],
  result: ReviewResult,
  verifications: readonly FindingVerification[],
  analyzed: ReviewRevision,
  current: ReviewRevision,
  botId: string
): ReconciliationPlan {
  if (!sameRevision(analyzed, current)) {
    return { stale: true, actions: [], openFindingIds: [], summary: "Review superseded by a new revision." };
  }
  if (!botId || !analyzed.source || !analyzed.target) {
    throw new Error("Review ownership and revision are required.");
  }
  const prior = new Map(previous.map((item) => [item.finding.id, item]));
  if (prior.size !== previous.length) throw new Error("Duplicate stored finding IDs.");
  const checks = new Map(verifications.map((item) => [item.findingId, item]));
  if (checks.size !== verifications.length) throw new Error("Duplicate finding verifications.");
  const actions: ReviewAction[] = [];
  const open = new Set(previous.filter((item) => item.ownerId === botId && item.state === "active").map((item) => item.finding.id));
  const incoming = new Set(result.findings.map((finding) => finding.id));
  if (incoming.size !== result.findings.length) throw new Error("Duplicate incoming finding IDs.");

  for (const check of verifications) {
    const old = prior.get(check.findingId);
    if (!old || old.ownerId !== botId || old.state !== "active" || !sameRevision(check.revision, current)) continue;
    if (!["fixed", "withdrawn"].includes(check.outcome)) continue;
    if (!check.reason.trim()) throw new Error("Resolution requires an evidence-backed explanation.");
    if (incoming.has(check.findingId)) throw new Error("A finding cannot be both present and resolved in the same review.");
    actions.push({
      kind: check.outcome === "fixed" ? "resolve" : "withdraw",
      findingId: check.findingId,
      threadId: old.threadId,
      reason: check.reason
    });
    open.delete(check.findingId);
  }

  for (const finding of result.findings) {
    if (finding.confidence === "low") continue;
    const old = prior.get(finding.id);
    if (old && (old.ownerId !== botId || ["human-resolved", "dismissed"].includes(old.state))) continue;
    if (old?.state === "active") continue;
    if (old) {
      // A confirmed recurrence gets a linked new thread, never reopens a closed human discussion.
      const digest = createHash("sha256").update(`${finding.id}\n${current.source}\n${current.target}`).digest("hex").slice(0, 20);
      const regression = { ...finding, id: `regression-${digest}` };
      if (!prior.has(regression.id)) {
        actions.push({ kind: "add", finding: regression, priorThreadId: old.threadId });
        open.add(regression.id);
      }
    } else {
      actions.push({ kind: "add", finding });
      open.add(finding.id);
    }
  }
  return { stale: false, actions, openFindingIds: [...open], summary: result.summary };
}

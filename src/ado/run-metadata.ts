// A durable review-run record lives in a bot-authored ADO thread. The marker
// stores only review metadata, never credentials or repository content. A run
// marker is accepted only when its author matches the authenticated pipeline.
import { ReviewGuide } from "../review/types";
import { ReviewRevision } from "../review/lifecycle";
import { AdoThread } from "./types";

const RUN_PREFIX = "<!-- masthead:run:1:";
const RUN_PATTERN = /^\s*<!-- masthead:run:1:([A-Za-z0-9_-]+) -->/;
const OWNER_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const REVISION_PATTERN = /^[A-Za-z0-9:._-]{1,200}$/;
const DELIVERY_PATTERN = /^[A-Za-z0-9:._-]{1,200}$/;
const MAX_METADATA_LENGTH = 100_000;

export interface ReviewRunMetadata {
  version: 1;
  kind: "run";
  ownerId: string;
  revision: ReviewRevision;
  status: "completed";
  summary: string;
  findingCount: number;
  reviewedAt: string;
  guide?: ReviewGuide;
  deliveryKey?: string;
}

export interface StoredRun {
  metadata: ReviewRunMetadata;
  threadId: number;
  commentId: number;
}

export function encodeRunMetadata(metadata: ReviewRunMetadata): string {
  const serialized = JSON.stringify(metadata);
  if (serialized.length > MAX_METADATA_LENGTH) throw new Error("Run metadata is too large to publish.");
  return `${RUN_PREFIX}${Buffer.from(serialized, "utf8").toString("base64url")} -->`;
}

export function decodeRunMetadata(content: string): ReviewRunMetadata | undefined {
  if (content.length > MAX_METADATA_LENGTH * 2) return undefined;
  const match = RUN_PATTERN.exec(content);
  if (!match) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  if (!isRecord(value) || value.version !== 1 || value.kind !== "run" ||
      typeof value.ownerId !== "string" || !OWNER_PATTERN.test(value.ownerId) ||
      value.status !== "completed" ||
      !isRecord(value.revision) ||
      typeof value.revision.source !== "string" || !REVISION_PATTERN.test(value.revision.source) ||
      typeof value.revision.target !== "string" || !REVISION_PATTERN.test(value.revision.target) ||
      typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 8_000 ||
      typeof value.findingCount !== "number" || !Number.isSafeInteger(value.findingCount) || value.findingCount < 0 ||
      typeof value.reviewedAt !== "string" || !Number.isFinite(Date.parse(value.reviewedAt))) {
    return undefined;
  }
  if (value.deliveryKey !== undefined &&
      (typeof value.deliveryKey !== "string" || !DELIVERY_PATTERN.test(value.deliveryKey))) {
    return undefined;
  }
  const guide = parseGuide(value.guide);
  if (value.guide !== undefined && !guide) return undefined;
  return {
    version: 1,
    kind: "run",
    ownerId: value.ownerId,
    revision: { source: value.revision.source, target: value.revision.target },
    status: "completed",
    summary: value.summary.trim(),
    findingCount: value.findingCount,
    reviewedAt: value.reviewedAt,
    ...(guide ? { guide } : {}),
    ...(typeof value.deliveryKey === "string" ? { deliveryKey: value.deliveryKey } : {})
  };
}

export function renderRunComment(metadata: ReviewRunMetadata): string {
  const guide = metadata.guide ? renderGuide(metadata.guide) : "";
  return `${encodeRunMetadata(metadata)}

## Masthead review

${escapeHtml(metadata.summary)}${guide}

<sub>Reviewed source \`${escapeHtml(metadata.revision.source)}\` against target \`${escapeHtml(metadata.revision.target)}\`. ${metadata.findingCount} advisory finding${metadata.findingCount === 1 ? "" : "s"}. This summary does not approve or merge the pull request.</sub>`;
}

/** Find the latest completed run owned by the authenticated bot identity. */
export function latestRunFromThreads(threads: readonly AdoThread[], botId: string): StoredRun | undefined {
  if (!botId) throw new Error("Masthead identity is required.");
  let latest: StoredRun | undefined;
  for (const thread of threads) {
    for (const comment of thread.comments) {
      if (comment.author?.id !== botId || typeof comment.content !== "string") continue;
      const metadata = decodeRunMetadata(comment.content);
      if (!metadata || metadata.ownerId !== botId) continue;
      if (!latest || comment.id > latest.commentId) {
        latest = { metadata, threadId: thread.id, commentId: comment.id };
      }
    }
  }
  return latest;
}

function parseGuide(value: unknown): ReviewGuide | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.intent !== "string" || !value.intent.trim() || value.intent.length > 4_000) return undefined;
  const readingOrder = stringList(value.readingOrder, 20);
  const attention = stringList(value.attention, 20);
  const verification = stringList(value.verification, 20);
  if (!readingOrder || !attention || !verification) return undefined;
  return {
    intent: value.intent.trim(),
    readingOrder,
    attention,
    verification
  };
}

function stringList(value: unknown, limit: number): string[] | undefined {
  if (!Array.isArray(value) || value.length > limit) return undefined;
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !entry.trim() || entry.length > 1_000) return undefined;
    result.push(entry.trim());
  }
  return result;
}

function renderGuide(guide: ReviewGuide): string {
  const section = (title: string, values: readonly string[]): string => values.length === 0
    ? ""
    : `\n\n**${title}**\n${values.map((value) => `- ${escapeHtml(value)}`).join("\n")}`;
  return `\n\n**Intent**\n${escapeHtml(guide.intent)}` +
    section("Reading order", guide.readingOrder) +
    section("Attention", guide.attention) +
    section("Verification", guide.verification);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

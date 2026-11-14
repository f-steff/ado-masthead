// A revision-scoped lock kept in Azure DevOps extension data. Azure DevOps can
// deliver the same event twice, so two workers may otherwise review one revision
// concurrently and publish duplicate threads. Document creation is atomic; a
// stale lock is replaced only when its stored ETag still matches.
import { createHash, randomUUID } from "node:crypto";
import { extensionManagementUrl } from "./settings";

const COLLECTION = "mastheadLocks";
const API_VERSION = "6.0-preview.1";
const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1_000;

export interface ReviewLockRevision {
  projectId: string;
  repositoryId: string;
  pullRequestId: number;
  source: string;
  target: string;
}

export interface ReviewLockOptions extends ReviewLockRevision {
  organizationUrl: string;
  token: string;
  tokenScheme: "basic" | "bearer";
  publisher: string;
  extensionId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  staleAfterMs?: number;
  now?: () => Date;
}

export interface ReviewLock {
  id: string;
  release(): Promise<void>;
}

export type ReviewLockResult =
  | { state: "acquired"; lock: ReviewLock }
  | { state: "held"; acquiredAt?: string }
  | { state: "unavailable"; message: string };

interface StoredDocument {
  id: string;
  etag: number;
  value: Record<string, unknown>;
}

/**
 * Acquire the lock for one destination revision. A lock that already exists is
 * reported as held unless it is older than the stale threshold; in that case the
 * ETag-guarded replacement ensures only one worker can take it over.
 */
export async function acquireReviewLock(options: ReviewLockOptions): Promise<ReviewLockResult> {
  const id = reviewLockDocumentId(options);
  const collectionUrl = reviewLockCollectionUrl(options);
  const documentUrl = `${collectionUrl}/${encodeURIComponent(id)}?api-version=${API_VERSION}`;
  const owner = randomUUID();
  const now = options.now?.() ?? new Date();
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const value = {
    owner,
    acquiredAt: now.toISOString(),
    pullRequestId: options.pullRequestId,
    projectId: options.projectId,
    repositoryId: options.repositoryId,
    source: options.source,
    target: options.target
  };

  try {
    // Two attempts cover the narrow race where a release happens between the
    // failed create and the follow-up read.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const created = await request(options, `${collectionUrl}?api-version=${API_VERSION}`, {
        method: "POST",
        body: { id, value }
      });
      if (created.ok) {
        return { state: "acquired", lock: lockHandle(id, owner, documentUrl, options) };
      }

      const existing = await readDocument(options, documentUrl);
      if (!existing) continue;
      if (!lockIsStale(existing.value, now.getTime(), staleAfterMs)) {
        return {
          state: "held",
          ...(typeof existing.value.acquiredAt === "string" ? { acquiredAt: existing.value.acquiredAt } : {})
        };
      }

      // Replace only the document version that was inspected. A concurrent
      // takeover or release changes the ETag and fails this update.
      const replaced = await request(options, documentUrl, {
        method: "PUT",
        body: { id, value, __etag: existing.etag }
      });
      if (replaced.ok) {
        return { state: "acquired", lock: lockHandle(id, owner, documentUrl, options) };
      }
      if (replaced.status === 409 || replaced.status === 412) return { state: "held" };
      return { state: "unavailable", message: `Review lock update failed with HTTP ${replaced.status}.` };
    }
    return { state: "unavailable", message: "Review lock could not be created." };
  } catch (error) {
    return {
      state: "unavailable",
      message: error instanceof Error ? error.message : "Review lock could not be created."
    };
  }
}

/** Deterministic ID; extension data document ids are limited to 50 characters. */
export function reviewLockDocumentId(revision: ReviewLockRevision): string {
  const projectId = requiredSegment(revision.projectId, "project id").toLowerCase();
  const repositoryId = requiredSegment(revision.repositoryId, "repository id").toLowerCase();
  if (!Number.isSafeInteger(revision.pullRequestId) || revision.pullRequestId <= 0) {
    throw new Error("A positive pull request id is required.");
  }
  if (!commitId(revision.source) || !commitId(revision.target)) {
    throw new Error("Review lock revisions must be commit ids.");
  }
  const digest = createHash("sha256")
    .update(JSON.stringify([projectId, repositoryId, revision.pullRequestId, revision.source, revision.target]))
    .digest("hex");
  return `m-${digest.slice(0, 40)}`;
}

/** A lock without a usable timestamp is treated as stale so it cannot block forever. */
export function lockIsStale(
  value: Record<string, unknown>,
  nowMs: number,
  staleAfterMs: number
): boolean {
  if (!Number.isFinite(nowMs) || !Number.isFinite(staleAfterMs) || staleAfterMs <= 0) return true;
  if (typeof value.acquiredAt !== "string") return true;
  const acquired = Date.parse(value.acquiredAt);
  if (!Number.isFinite(acquired)) return true;
  // A timestamp far in the future is corrupt rather than a reason to hold the
  // lock until that time arrives.
  if (acquired > nowMs + 5 * 60 * 1_000) return true;
  return nowMs - acquired >= staleAfterMs;
}

function lockHandle(
  id: string,
  owner: string,
  documentUrl: string,
  options: ReviewLockOptions
): ReviewLock {
  return {
    id,
    async release(): Promise<void> {
      const existing = await readDocument(options, documentUrl);
      // A stale lock may already have been taken over by another worker. Only
      // the owner may delete it.
      if (!existing || existing.value.owner !== owner) return;
      const response = await request(options, documentUrl, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Review lock release failed with HTTP ${response.status}.`);
      }
    }
  };
}

async function readDocument(
  options: ReviewLockOptions,
  url: string
): Promise<StoredDocument | undefined> {
  const response = await request(options, url);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Review lock read failed with HTTP ${response.status}.`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Review lock returned invalid JSON.");
  }
  if (!isRecord(payload) || typeof payload.id !== "string" ||
      typeof payload.__etag !== "number" || !Number.isSafeInteger(payload.__etag) ||
      !isRecord(payload.value)) {
    throw new Error("Review lock returned an invalid document.");
  }
  return { id: payload.id, etag: payload.__etag, value: payload.value };
}

async function request(
  options: ReviewLockOptions,
  url: string,
  init: { method?: string; body?: unknown } = {}
): Promise<Response> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  try {
    return await (options.fetchImpl ?? fetch)(url, {
      method: init.method ?? "GET",
      headers: {
        authorization: options.tokenScheme === "bearer"
          ? `Bearer ${options.token}`
          : `Basic ${Buffer.from(`:${options.token}`, "utf8").toString("base64")}`,
        accept: "application/json",
        ...(init.body === undefined ? {} : { "content-type": "application/json" })
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: timeout,
      redirect: "error"
    });
  } catch {
    throw new Error("Review lock request could not be completed.");
  }
}

function reviewLockCollectionUrl(options: ReviewLockOptions): string {
  if (!options.token.trim()) throw new Error("An Azure DevOps token is required for the review lock.");
  const publisher = requiredSegment(options.publisher, "publisher");
  const extensionId = requiredSegment(options.extensionId, "extension id");
  return `${extensionManagementUrl(options.organizationUrl)}/_apis/ExtensionManagement/InstalledExtensions/` +
    `${encodeURIComponent(publisher)}/${encodeURIComponent(extensionId)}/Data/Scopes/Default/Current/` +
    `Collections/${COLLECTION}/Documents`;
}

function commitId(value: string): boolean {
  return /^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(value);
}

function requiredSegment(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200 || /[/\\?#\r\n]/.test(trimmed)) {
    throw new Error(`Invalid ${name}.`);
  }
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

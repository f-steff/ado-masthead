// Minimal Azure DevOps REST adapter for the publisher. It intentionally exposes
// only the calls needed to read PR state and create, reply to or close threads.
// Repository content retrieval belongs to the review orchestrator, not here.
import { AdoChangedFile, AdoComment, AdoPullRequest, AdoThread, AdoThreadStatus, CreateThreadInput } from "./types";
import { repositoryPath } from "../review/result";

export interface AdoClientOptions {
  organizationUrl: string;
  project: string;
  repositoryId: string;
  token: string;
  /** PATs use Basic; a pipeline System.AccessToken uses Bearer. */
  tokenScheme?: "basic" | "bearer";
  apiVersion?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface AdoIdentityResponse {
  id: string;
  displayName?: string;
}

export interface AdoThreadReply {
  comment: AdoComment;
}

export interface AdoClientLike {
  getPullRequest(pullRequestId: number): Promise<AdoPullRequest>;
  getAuthenticatedIdentity(): Promise<AdoIdentityResponse>;
  listThreads(pullRequestId: number): Promise<AdoThread[]>;
  createThread(pullRequestId: number, input: CreateThreadInput): Promise<AdoThread>;
  addThreadComment(pullRequestId: number, threadId: number, content: string, parentCommentId?: number): Promise<AdoThreadReply>;
  updateThreadStatus(pullRequestId: number, threadId: number, status: AdoThreadStatus): Promise<void>;
}

/** The review runner additionally needs read-only repository content. */
export interface AdoReviewClient extends AdoClientLike {
  listPullRequestChanges(pullRequestId: number): Promise<AdoChangedFile[]>;
  getItemContent(commitId: string, path: string): Promise<string | null>;
}

export class AdoClient implements AdoReviewClient {
  private readonly organizationUrl: string;
  private readonly project: string;
  private readonly repositoryId: string;
  private readonly token: string;
  private readonly tokenScheme: "basic" | "bearer";
  private readonly apiVersion: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: AdoClientOptions) {
    this.organizationUrl = validOrganizationUrl(options.organizationUrl);
    this.project = requiredSegment(options.project, "project");
    this.repositoryId = requiredSegment(options.repositoryId, "repository");
    this.token = options.token.trim();
    if (!this.token) throw new Error("Azure DevOps token is required.");
    this.tokenScheme = options.tokenScheme ?? "basic";
    if (this.tokenScheme !== "basic" && this.tokenScheme !== "bearer") {
      throw new Error("Invalid Azure DevOps token scheme.");
    }
    this.apiVersion = options.apiVersion ?? "7.1";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new Error("Azure DevOps timeout must be a positive integer.");
    }
  }

  /** Resolve the PR's current source and target before any planned action. */
  async getPullRequest(pullRequestId: number): Promise<AdoPullRequest> {
    const value = await this.request(`/pullRequests/${positiveId(pullRequestId)}`);
    if (!isRecord(value) || !isRecord(value.lastMergeSourceCommit) ||
        !isRecord(value.lastMergeTargetCommit) || !isRecord(value.repository) ||
        typeof value.lastMergeSourceCommit.commitId !== "string" ||
        typeof value.lastMergeTargetCommit.commitId !== "string") {
      throw new Error("Azure DevOps returned an invalid pull request.");
    }
    return value as unknown as AdoPullRequest;
  }

  /** Used to attribute markers to the authenticated Masthead identity. */
  async getAuthenticatedIdentity(): Promise<AdoIdentityResponse> {
    // connectionData is still preview-only; a plain 7.1 version returns HTTP 400.
    const value = await this.requestAbsolute("/_apis/connectionData", "7.1-preview");
    if (!isRecord(value) || !isRecord(value.authenticatedUser) ||
        typeof value.authenticatedUser.id !== "string" || !value.authenticatedUser.id) {
      throw new Error("Azure DevOps returned an invalid authenticated identity.");
    }
    return {
      id: value.authenticatedUser.id,
      displayName: typeof value.authenticatedUser.providerDisplayName === "string"
        ? value.authenticatedUser.providerDisplayName
        : undefined
    };
  }

  async listThreads(pullRequestId: number): Promise<AdoThread[]> {
    const value = await this.request(`/pullRequests/${positiveId(pullRequestId)}/threads`);
    const entries = isRecord(value) && Array.isArray(value.value) ? value.value : [];
    return entries.map(parseThread);
  }

  /** Prefer the PR iteration changes; fall back to the source-vs-target commit diff. */
  async listPullRequestChanges(pullRequestId: number): Promise<AdoChangedFile[]> {
    const id = positiveId(pullRequestId);
    const pr = await this.getPullRequest(id);
    const iterations = await this.request(`/pullRequests/${id}/iterations`);
    const entries = isRecord(iterations) && Array.isArray(iterations.value) ? iterations.value : [];
    const latest = entries
      .filter((entry): entry is Record<string, unknown> => isRecord(entry) && Number.isSafeInteger(entry.id))
      .sort((left, right) => Number(right.id) - Number(left.id))[0];
    let changes: unknown[] = [];
    if (latest) {
      const value = await this.request(`/pullRequests/${id}/iterations/${Number(latest.id)}/changes`);
      if (isRecord(value) && Array.isArray(value.changeEntries)) changes = value.changeEntries;
      else if (isRecord(value) && Array.isArray(value.value)) changes = value.value;
    }
    if (changes.length === 0) {
      const value = await this.request(
        `/commits/${commitId(pr.lastMergeSourceCommit.commitId)}/changes?baseVersion=${commitId(pr.lastMergeTargetCommit.commitId)}&baseVersionType=commit`
      );
      if (isRecord(value) && Array.isArray(value.changes)) changes = value.changes;
    }
    return changes.map(parseChange).filter((change): change is AdoChangedFile => change !== undefined);
  }

  /** Read one text item at a fixed commit; a missing item is normal for LICENSE probes. */
  async getItemContent(commitIdValue: string, path: string): Promise<string | null> {
    const normalized = repositoryPath(path);
    const value = await this.request(
      `/items?path=${encodeURIComponent(`/${normalized}`)}&versionDescriptor.version=${encodeURIComponent(commitId(commitIdValue))}&versionDescriptor.versionType=commit&includeContent=true`
    ).catch((error: unknown) => {
      if (error instanceof AdoClientError && error.status === 404) return undefined;
      throw error;
    });
    if (value === undefined) return null;
    if (!isRecord(value) || typeof value.content !== "string") {
      throw new Error("Azure DevOps returned an invalid item.");
    }
    return value.content;
  }

  async createThread(pullRequestId: number, input: CreateThreadInput): Promise<AdoThread> {
    if (!input.content.trim()) throw new Error("A thread comment is required.");
    const body: Record<string, unknown> = {
      comments: [{ parentCommentId: 0, content: input.content, commentType: 1 }],
      status: input.status ?? "active"
    };
    if (input.filePath) {
      const line = input.line ?? 1;
      if (!Number.isSafeInteger(line) || line < 1) {
        throw new Error("A thread line must be a positive integer.");
      }
      body.threadContext = {
        filePath: normalizedThreadPath(input.filePath),
        rightFileStart: { line, offset: 1 },
        rightFileEnd: { line, offset: 1 }
      };
    }
    const value = await this.request(`/pullRequests/${positiveId(pullRequestId)}/threads`, {
      method: "POST",
      body
    });
    return parseThread(value);
  }

  async addThreadComment(
    pullRequestId: number,
    threadId: number,
    content: string,
    parentCommentId = 0
  ): Promise<AdoThreadReply> {
    if (!content.trim()) throw new Error("A reply is required.");
    const value = await this.request(
      `/pullRequests/${positiveId(pullRequestId)}/threads/${positiveId(threadId)}/comments`,
      {
        method: "POST",
        body: { parentCommentId, content, commentType: 1 }
      }
    );
    if (!isRecord(value)) throw new Error("Azure DevOps returned an invalid comment.");
    return { comment: parseComment(value) };
  }

  async updateThreadStatus(
    pullRequestId: number,
    threadId: number,
    status: AdoThreadStatus
  ): Promise<void> {
    await this.request(
      `/pullRequests/${positiveId(pullRequestId)}/threads/${positiveId(threadId)}`,
      { method: "PATCH", body: { status } }
    );
  }

  /** Use only the configured organization endpoint; never event-supplied URLs. */
  private async requestAbsolute(pathname: string, apiVersion = this.apiVersion): Promise<unknown> {
    return this.send(`${this.organizationUrl}${pathname}?api-version=${encodeURIComponent(apiVersion)}`);
  }

  private async request(pathname: string, options: { method?: string; body?: unknown } = {}): Promise<unknown> {
    const prefix = `${this.organizationUrl}/${encodeURIComponent(this.project)}/_apis/git/repositories/${encodeURIComponent(this.repositoryId)}`;
    const separator = pathname.includes("?") ? "&" : "?";
    const url = `${prefix}${pathname}${separator}api-version=${encodeURIComponent(this.apiVersion)}`;
    return this.send(url, options);
  }

  /** Bound the request and never retain a response body in an error message. */
  private async send(
    url: string,
    options: { method?: string; body?: unknown } = {}
  ): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: options.method ?? "GET",
        headers: {
          authorization: this.tokenScheme === "bearer"
            ? `Bearer ${this.token}`
            : `Basic ${Buffer.from(`:${this.token}`, "utf8").toString("base64")}`,
          "content-type": "application/json",
          accept: "application/json"
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: timeout,
        redirect: "error"
      });
    } catch {
      throw new Error("Azure DevOps request could not be completed.");
    }
    if (!response.ok) {
      throw new AdoClientError(response.status);
    }
    const text = await response.text();
    if (!text.trim()) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Azure DevOps returned invalid JSON.");
    }
  }
}

export class AdoClientError extends Error {
  constructor(readonly status: number) {
    super(`Azure DevOps request failed with HTTP ${status}.`);
    this.name = "AdoClientError";
  }
}

/** Validate the configured origin without permitting credentials or path tricks. */
function validOrganizationUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Azure DevOps organization URL is invalid.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
    throw new Error("Azure DevOps organization URL must use HTTPS.");
  }
  return url.href.replace(/\/+$/, "");
}

function requiredSegment(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200 || /[\/\\?#]/.test(trimmed)) {
    throw new Error(`Invalid Azure DevOps ${name}.`);
  }
  return trimmed;
}

function positiveId(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Expected a positive Azure DevOps identifier.");
  }
  return value;
}

function normalizedThreadPath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  if (!normalized.startsWith("/") || normalized.includes("..") || normalized.includes("//")) {
    throw new Error("Invalid Azure DevOps thread path.");
  }
  return normalized;
}

function parseThread(value: unknown): AdoThread {
  if (!isRecord(value) || !Number.isSafeInteger(value.id) || !Array.isArray(value.comments)) {
    throw new Error("Azure DevOps returned an invalid thread.");
  }
  const status = typeof value.status === "string" ? value.status : "unknown";
  return {
    id: value.id as number,
    status: validStatus(status),
    comments: value.comments.map(parseComment),
    ...(isRecord(value.threadContext) ? { threadContext: value.threadContext as AdoThread["threadContext"] } : {})
  };
}

function parseChange(value: unknown): AdoChangedFile | undefined {
  if (!isRecord(value) || !isRecord(value.item) || typeof value.item.path !== "string" ||
      value.item.isFolder === true) {
    return undefined;
  }
  let path: string;
  try {
    path = repositoryPath(value.item.path.replace(/^\/+/, ""));
  } catch {
    return undefined;
  }
  return { path, changeType: changeType(value.changeType) };
}

function changeType(value: unknown): AdoChangedFile["changeType"] {
  const names: Record<string, AdoChangedFile["changeType"]> = {
    add: "add", edit: "edit", delete: "delete", rename: "rename"
  };
  const byNumber: Record<number, AdoChangedFile["changeType"]> = {
    1: "add", 2: "edit", 3: "delete", 4: "rename"
  };
  if (typeof value === "number" && byNumber[value]) return byNumber[value];
  if (typeof value === "string" && names[value.toLowerCase()]) return names[value.toLowerCase()];
  return "edit";
}

function commitId(value: string): string {
  if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(value)) {
    throw new Error("Azure DevOps returned an invalid commit ID.");
  }
  return value;
}

function parseComment(value: unknown): AdoComment {
  if (!isRecord(value) || !Number.isSafeInteger(value.id)) {
    throw new Error("Azure DevOps returned an invalid comment.");
  }
  return {
    id: value.id as number,
    ...(Number.isSafeInteger(value.parentCommentId) ? { parentCommentId: value.parentCommentId as number } : {}),
    ...(isRecord(value.author) && typeof value.author.id === "string"
      ? { author: { id: value.author.id, ...(typeof value.author.displayName === "string" ? { displayName: value.author.displayName } : {}) } }
      : {}),
    ...(typeof value.content === "string" ? { content: value.content } : {})
  };
}

function validStatus(value: string): AdoThreadStatus {
  const values: AdoThreadStatus[] = ["unknown", "active", "fixed", "wontFix", "closed", "byDesign", "pending"];
  return values.includes(value as AdoThreadStatus) ? value as AdoThreadStatus : "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Pull request tab. The host supplies the current PR and repository ids through
// the SDK configuration handshake; the page reads only that PR, never unrelated
// tabs or repositories.
import * as SDK from "azure-devops-extension-sdk";
import {
  defaultOrganizationSettings,
  defaultProjectSettings,
  isReviewEnabled,
  normalizeOrganizationSettings,
  normalizeProjectSettings,
  OrganizationSettings,
  ProjectSettings,
  reviewSelection
} from "../../settings";
import { initializeHost, notifyHostFailed, notifyHostLoaded, organizationUrl } from "../shared/host";
import { loadSetting } from "../shared/storage";

const statusText = document.querySelector<HTMLElement>("#host-status");
const statusDot = document.querySelector<HTMLElement>("#status-dot");
const hostMeta = document.querySelector<HTMLElement>("#host-meta");
const prLede = document.querySelector<HTMLElement>("#pr-lede");
const prTitle = document.querySelector<HTMLElement>("#pr-title");
const threadCount = document.querySelector<HTMLElement>("#thread-count");
const threadState = document.querySelector<HTMLElement>("#thread-state");
const reviewStatus = document.querySelector<HTMLElement>("#review-status");
const gateState = document.querySelector<HTMLElement>("#gate-state");
const profileState = document.querySelector<HTMLElement>("#profile-state");
const reviewSummary = document.querySelector<HTMLElement>("#review-summary");
const reviewGuide = document.querySelector<HTMLElement>("#review-guide");
const findingList = document.querySelector<HTMLElement>("#finding-list");
const prStatus = document.querySelector<HTMLElement>("#pr-status");
const projectSettingsLink = document.querySelector<HTMLAnchorElement>("#project-settings-link");
const prLink = document.querySelector<HTMLAnchorElement>("#pr-link");

interface PullRequestSummary {
  pullRequestId?: number;
  title?: string;
  status?: string;
  repository?: { id?: string; name?: string; project?: { id?: string; name?: string } };
}

interface PullRequestStatusSummary {
  state: string;
  description?: string;
  timestamp: number;
}

interface ReviewRunSummary {
  ownerId: string;
  summary: string;
  findingCount: number;
  reviewedAt?: string;
  guide?: {
    intent: string;
    readingOrder: string[];
    attention: string[];
    verification: string[];
  };
}

interface FindingSummary {
  id: string;
  title: string;
  severity: string;
  file: string;
  line?: number;
  state: string;
}

/** Read the latest Masthead status without trusting arbitrary status entries. */
function latestMastheadStatus(values: unknown[]): PullRequestStatusSummary | undefined {
  const matches: PullRequestStatusSummary[] = [];
  for (const value of values) {
    if (typeof value !== "object" || value === null) continue;
    const status = value as { state?: unknown; description?: unknown; context?: unknown; updatedDate?: unknown; creationDate?: unknown };
    if (typeof status.state !== "string" || typeof status.context !== "object" || status.context === null) continue;
    const context = status.context as { genre?: unknown; name?: unknown };
    if (context.genre !== "masthead" || context.name !== "review") continue;
    const date = typeof status.updatedDate === "string"
      ? Date.parse(status.updatedDate)
      : typeof status.creationDate === "string"
        ? Date.parse(status.creationDate)
        : 0;
    matches.push({
      state: status.state,
      ...(typeof status.description === "string" && status.description ? { description: status.description } : {}),
      timestamp: Number.isFinite(date) ? date : 0
    });
  }
  return matches.sort((left, right) => right.timestamp - left.timestamp)[0];
}

/** Read ids from either the query string or a hash-query supplied by the host. */
function contextParams(): URLSearchParams {
  const search = new URLSearchParams(window.location.search);
  const hashQuery = window.location.hash.includes("?")
    ? window.location.hash.slice(window.location.hash.indexOf("?") + 1)
    : "";
  for (const [key, value] of new URLSearchParams(hashQuery)) {
    if (!search.has(key)) search.set(key, value);
  }
  return search;
}

/**
 * Read a string or positive integer from the SDK configuration. PR tabs are
 * documented to receive pullRequestId and repositoryId, but older hosts differ.
 */
function configurationValue(configuration: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = configuration[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  }
  return "";
}

/** Older hosts did not add query parameters to PR-tab iframes; support that too. */
function pullRequestFromReferrer(): string | undefined {
  try {
    const url = new URL(document.referrer);
    return /\/pullrequest\/([1-9]\d*)(?:\/|$)/i.exec(url.pathname)?.[1];
  } catch {
    return undefined;
  }
}

/** Decode a Masthead thread marker without trusting its content as HTML. */
function decodeMarker(content: string, kind: "finding" | "run"): Record<string, unknown> | undefined {
  const pattern = kind === "run"
    ? /^\s*<!-- masthead:run:1:([A-Za-z0-9_-]+) -->/
    : /^\s*<!-- masthead:1:([A-Za-z0-9_-]+) -->/;
  const match = pattern.exec(content);
  if (!match) return undefined;
  try {
    const base64 = match[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function parseGuide(value: unknown): ReviewRunSummary["guide"] | undefined {
  if (!isRecord(value) || typeof value.intent !== "string") return undefined;
  const list = (item: unknown): string[] => Array.isArray(item)
    ? item.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    intent: value.intent,
    readingOrder: list(value.readingOrder),
    attention: list(value.attention),
    verification: list(value.verification)
  };
}

function latestRunSummary(values: readonly unknown[]): ReviewRunSummary | undefined {
  let latest: { commentId: number; summary: ReviewRunSummary } | undefined;
  for (const thread of values) {
    if (!isRecord(thread) || !Array.isArray(thread.comments)) continue;
    for (const comment of thread.comments) {
      if (!isRecord(comment) || typeof comment.content !== "string") continue;
      const metadata = decodeMarker(comment.content, "run");
      if (!metadata || metadata.version !== 1 || metadata.kind !== "run" ||
          typeof metadata.ownerId !== "string" || typeof metadata.summary !== "string" ||
          !isRecord(comment.author) || comment.author.id !== metadata.ownerId ||
          typeof metadata.findingCount !== "number" || !Number.isSafeInteger(metadata.findingCount) ||
          metadata.findingCount < 0) {
        continue;
      }
      const commentId = typeof comment.id === "number" ? comment.id : 0;
      if (latest && commentId <= latest.commentId) continue;
      const guide = parseGuide(metadata.guide);
      latest = {
        commentId,
        summary: {
          ownerId: metadata.ownerId,
          summary: metadata.summary,
          findingCount: metadata.findingCount,
          ...(typeof metadata.reviewedAt === "string" ? { reviewedAt: metadata.reviewedAt } : {}),
          ...(guide ? { guide } : {})
        }
      };
    }
  }
  return latest?.summary;
}

function latestFindings(values: readonly unknown[], ownerId?: string): FindingSummary[] {
  const latest = new Map<string, { commentId: number; finding: FindingSummary }>();
  for (const thread of values) {
    if (!isRecord(thread) || !Array.isArray(thread.comments)) continue;
    for (const comment of thread.comments) {
      if (!isRecord(comment) || typeof comment.content !== "string" ||
          !isRecord(comment.author) || typeof comment.author.id !== "string") {
        continue;
      }
      const metadata = decodeMarker(comment.content, "finding");
      if (!metadata || metadata.version !== 1 || metadata.kind !== "finding" ||
          metadata.ownerId !== comment.author.id ||
          (ownerId !== undefined && metadata.ownerId !== ownerId) ||
          !isRecord(metadata.finding)) {
        continue;
      }
      const finding = metadata.finding;
      if (typeof finding.id !== "string" || typeof finding.title !== "string" ||
          typeof finding.severity !== "string" || typeof finding.file !== "string") {
        continue;
      }
      const state = metadata.state === "bot-fixed" || thread.status === "fixed"
        ? "resolved"
        : metadata.state === "bot-withdrawn" ? "withdrawn" : "active";
      const commentId = typeof comment.id === "number" ? comment.id : 0;
      const existing = latest.get(finding.id);
      if (existing && existing.commentId >= commentId) continue;
      latest.set(finding.id, {
        commentId,
        finding: {
          id: finding.id,
          title: finding.title,
          severity: finding.severity,
          file: finding.file,
          ...(typeof finding.line === "number" && Number.isSafeInteger(finding.line) ? { line: finding.line } : {}),
          state
        }
      });
    }
  }
  const rank: Record<string, number> = { critical: 0, major: 1, warning: 2, minor: 3, info: 4 };
  return [...latest.values()]
    .map((entry) => entry.finding)
    .sort((left, right) =>
      (rank[left.severity] ?? 9) - (rank[right.severity] ?? 9) ||
      left.file.localeCompare(right.file) ||
      (left.line ?? 0) - (right.line ?? 0)
    );
}

function appendGuide(container: HTMLElement, title: string, values: readonly string[]): void {
  if (values.length === 0) return;
  const heading = document.createElement("h4");
  heading.textContent = title;
  const list = document.createElement("ul");
  for (const value of values) {
    const item = document.createElement("li");
    item.textContent = value;
    list.append(item);
  }
  container.append(heading, list);
}

function renderReviewDetails(values: readonly unknown[]): void {
  const run = latestRunSummary(values);
  if (reviewSummary) {
    reviewSummary.textContent = run
      ? run.summary
      : "No completed review summary has been published yet.";
  }
  if (reviewGuide) {
    reviewGuide.replaceChildren();
    if (run?.guide) {
      appendGuide(reviewGuide, "Intent", [run.guide.intent]);
      appendGuide(reviewGuide, "Reading order", run.guide.readingOrder);
      appendGuide(reviewGuide, "Attention", run.guide.attention);
      appendGuide(reviewGuide, "Verification", run.guide.verification);
    } else if (run) {
      reviewGuide.textContent = "No review guide was published for this run.";
    }
  }
  const findings = latestFindings(values, run?.ownerId);
  if (!findingList) return;
  findingList.replaceChildren();
  if (findings.length === 0) {
    findingList.textContent = run ? "No advisory findings for this run." : "No review findings are available.";
    return;
  }
  for (const finding of findings) {
    const item = document.createElement("div");
    item.className = "finding-item";
    const title = document.createElement("h4");
    const severity = document.createElement("span");
    severity.className = "finding-severity";
    severity.textContent = finding.severity;
    title.append(severity, document.createTextNode(finding.title));
    const meta = document.createElement("div");
    meta.className = "finding-meta";
    meta.textContent = `${finding.file}${finding.line ? `:${finding.line}` : ""} - ${finding.state}`;
    item.append(title, meta);
    findingList.append(item);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setStatus(message: string, kind: "info" | "success" | "error" = "info"): void {
  if (!prStatus) return;
  prStatus.textContent = message;
  prStatus.className = `status-message${kind === "info" ? "" : ` ${kind}`}`;
}

function settingLink(hostName: string, projectName: string, extensionId: string): string {
  return `https://dev.azure.com/${encodeURIComponent(hostName)}/${encodeURIComponent(projectName)}` +
    `/_settings/${encodeURIComponent(extensionId)}.masthead-project`;
}

/** Publish the page only after the ADO SDK handshake succeeds. */
async function main(): Promise<void> {
  let hostName = "";
  let extensionId = "";
  let projectId = "";
  let projectName = "";
  let configuration: Record<string, unknown> = {};
  try {
    const context = await initializeHost();
    hostName = context.host.name;
    extensionId = context.extension.id;
    configuration = SDK.getConfiguration();
    const project = SDK.getWebContext().project;
    projectId = project?.id ?? "";
    projectName = project?.name ?? "";
    if (statusDot) statusDot.className = "status-dot ready";
    if (statusText) statusText.textContent = "Connected to Azure DevOps.";
    if (hostMeta) hostMeta.textContent = projectName
      ? `${hostName} - ${projectName}`
      : `${hostName}`;
    if (projectSettingsLink && projectName && extensionId) {
      projectSettingsLink.href = settingLink(hostName, projectName, extensionId);
    }
    await notifyHostLoaded();
  } catch {
    if (statusDot) statusDot.className = "status-dot error";
    if (statusText) statusText.textContent = "Azure DevOps host connection failed.";
    await notifyHostFailed("Masthead could not initialize the pull request tab.");
    return;
  }

  const params = contextParams();
  const pullRequestId = positiveNumber(
    configurationValue(configuration, "pullRequestId", "prId") ||
    params.get("pullRequestId") ||
    params.get("prId") ||
    pullRequestFromReferrer() ||
    ""
  );
  let repositoryId = configurationValue(configuration, "repositoryId", "gitRepositoryId", "repoId") ||
    params.get("repositoryId") ||
    params.get("repoId") ||
    "";
  if (!projectId || !projectName) {
    if (prLede) prLede.textContent = "This tab was opened outside a project context.";
    setStatus("Open this tab from a pull request in an Azure DevOps project.", "error");
    return;
  }
  if (!pullRequestId) {
    if (prLede) prLede.textContent = "Waiting for a pull request identifier.";
    setStatus("The host did not provide a pull request id. Open the Masthead tab from a pull request.", "error");
    return;
  }

  try {
    const token = await SDK.getAccessToken();
    const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
    let pr: PullRequestSummary;
    if (repositoryId) {
      pr = await getJson<PullRequestSummary>(
        `${organizationUrl(hostName)}/${encodeURIComponent(projectName)}/_apis/git/repositories/` +
        `${encodeURIComponent(repositoryId)}/pullRequests/${pullRequestId}?api-version=7.1`,
        headers
      );
    } else {
      pr = await getJson<PullRequestSummary>(
        `${organizationUrl(hostName)}/${encodeURIComponent(projectName)}/_apis/git/pullrequests/` +
        `${pullRequestId}?api-version=7.1`,
        headers
      );
      repositoryId = pr.repository?.id ?? "";
    }
    const repositoryName = pr.repository?.name ?? "repository";
    const targetProjectId = pr.repository?.project?.id ?? projectId;
    if (prTitle) prTitle.textContent = pr.title || `Pull request ${pullRequestId}`;
    if (prLede) prLede.textContent = `${projectName} / ${repositoryName} / PR ${pullRequestId}`;
    if (prLink && repositoryId) {
      prLink.href = `https://dev.azure.com/${encodeURIComponent(hostName)}/${encodeURIComponent(projectName)}` +
        `/_git/${encodeURIComponent(repositoryName)}/pullrequest/${pullRequestId}`;
    }

    const threads = repositoryId
      ? await getJson<{ value?: unknown[] }>(
          `${organizationUrl(hostName)}/${encodeURIComponent(projectName)}/_apis/git/repositories/` +
          `${encodeURIComponent(repositoryId)}/pullRequests/${pullRequestId}/threads?api-version=7.1`,
          headers
        )
      : { value: [] };
    const mastheadThreads = (threads.value ?? []).filter((thread) => {
      if (typeof thread !== "object" || thread === null) return false;
      const comments = (thread as { comments?: unknown }).comments;
      return Array.isArray(comments) && comments.some((comment) =>
        typeof comment === "object" && comment !== null &&
        typeof (comment as { content?: unknown }).content === "string" &&
        (comment as { content: string }).content.includes("<!-- masthead:1:")
      );
    });
    const threadStatuses = mastheadThreads.map((thread) =>
      String((thread as { status?: unknown }).status ?? "unknown")
    );
    const fixed = threadStatuses.filter((state) => state === "fixed" || state === "closed" || state === "byDesign" || state === "wontFix").length;
    if (threadCount) threadCount.textContent = String(mastheadThreads.length);
    if (threadState) threadState.textContent = `${mastheadThreads.length - fixed} / ${fixed}`;
    renderReviewDetails(threads.value ?? []);

    const pullRequestStatuses = repositoryId
      ? await getJson<{ value?: unknown[] }>(
          `${organizationUrl(hostName)}/${encodeURIComponent(projectName)}/_apis/git/repositories/` +
          `${encodeURIComponent(repositoryId)}/pullRequests/${pullRequestId}/statuses?api-version=7.1`,
          headers
        )
      : { value: [] };
    const mastheadStatus = latestMastheadStatus(pullRequestStatuses.value ?? []);
    if (reviewStatus) {
      reviewStatus.textContent = mastheadStatus
        ? `Review status: ${mastheadStatus.state}${mastheadStatus.description ? ` - ${mastheadStatus.description}` : ""}`
        : "Review status: no Masthead status has been posted yet.";
    }

    let organization = defaultOrganizationSettings();
    let project = defaultProjectSettings();
    try {
      organization = normalizeOrganizationSettings(await loadSetting<OrganizationSettings>("organization", organization));
      project = normalizeProjectSettings(await loadSetting<ProjectSettings>(`project.${targetProjectId}`, project));
    } catch {
      // The summary below remains useful even when settings cannot be read.
    }
    const enabled = repositoryId ? isReviewEnabled(organization, project, repositoryId) : false;
    if (gateState) {
      gateState.textContent = enabled
        ? "Reviews are enabled for this destination project and repository."
        : "Reviews are currently disabled for this destination project or repository.";
    }
    try {
      const selection = reviewSelection(organization, project, repositoryId);
      if (profileState) {
        profileState.textContent = `Profile: ${selection.provider ?? "pipeline provider"} / ` +
          `${selection.model ?? "pipeline model"} / ${selection.profile.enabledLenses.join(", ")}`;
      }
    } catch {
      if (profileState) profileState.textContent = "The effective review profile could not be resolved.";
    }
    setStatus("Loaded current pull request review state.", "success");
  } catch (error) {
    if (prLede) prLede.textContent = "Pull request context could not be loaded.";
    setStatus(error instanceof Error ? error.message : "Pull request context could not be loaded.", "error");
  }
}

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const response = await fetch(url, { headers, redirect: "error" });
  if (!response.ok) throw new Error(`Azure DevOps request failed with HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}

function positiveNumber(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

void main();

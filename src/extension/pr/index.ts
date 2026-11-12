// Pull request tab. The host supplies the PR and repository ids in the iframe
// query string; the page reads only the current project and PR, never unrelated
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
const gateState = document.querySelector<HTMLElement>("#gate-state");
const profileState = document.querySelector<HTMLElement>("#profile-state");
const prStatus = document.querySelector<HTMLElement>("#pr-status");
const projectSettingsLink = document.querySelector<HTMLAnchorElement>("#project-settings-link");
const prLink = document.querySelector<HTMLAnchorElement>("#pr-link");

interface PullRequestSummary {
  pullRequestId?: number;
  title?: string;
  status?: string;
  repository?: { id?: string; name?: string; project?: { id?: string; name?: string } };
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
  try {
    const context = await initializeHost();
    hostName = context.host.name;
    extensionId = context.extension.id;
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
  const pullRequestId = positiveNumber(params.get("pullRequestId") ?? params.get("prId") ?? "");
  let repositoryId = params.get("repositoryId") ?? params.get("repoId") ?? "";
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
    const statuses = mastheadThreads.map((thread) =>
      String((thread as { status?: unknown }).status ?? "unknown")
    );
    const fixed = statuses.filter((state) => state === "fixed" || state === "closed" || state === "byDesign" || state === "wontFix").length;
    if (threadCount) threadCount.textContent = String(mastheadThreads.length);
    if (threadState) threadState.textContent = `${mastheadThreads.length - fixed} / ${fixed}`;

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

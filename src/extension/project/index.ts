// Project settings control repository eligibility only. The organization page
// owns the master switch, defaults, delivery mode and pipeline validation.
import * as SDK from "azure-devops-extension-sdk";
import {
  defaultOrganizationSettings,
  defaultProjectSettings,
  normalizeOrganizationSettings,
  normalizeProjectSettings,
  OrganizationSettings,
  ProjectSettings,
  RepositoryDefault,
  seedProjectRepositories
} from "../../settings";
import { initializeHost, notifyHostFailed, notifyHostLoaded, organizationUrl } from "../shared/host";
import { loadSetting, saveSetting } from "../shared/storage";

interface Repository {
  id: string;
  name: string;
}

const statusText = document.querySelector<HTMLElement>("#host-status");
const statusDot = document.querySelector<HTMLElement>("#status-dot");
const hostMeta = document.querySelector<HTMLElement>("#host-meta");
const projectEnabled = document.querySelector<HTMLInputElement>("#project-enabled");
const newRepositoryDefault = document.querySelector<HTMLSelectElement>("#new-repository-default");
const orgState = document.querySelector<HTMLElement>("#org-state");
const repositoryList = document.querySelector<HTMLElement>("#repository-list");
const repositoryStatus = document.querySelector<HTMLElement>("#repository-status");
const saveStatus = document.querySelector<HTMLElement>("#save-status");
const saveButton = document.querySelector<HTMLButtonElement>("#save-project");
const aboutVersion = document.querySelector<HTMLElement>("#about-version");
const form = document.querySelector<HTMLFormElement>("#project-form");
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-tab]"));
const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-panel]"));

let hostName = "";
let projectId = "";
let projectName = "";
let settings: ProjectSettings = defaultProjectSettings();
let organization: OrganizationSettings = defaultOrganizationSettings();
let repositories: Repository[] = [];

/** Report host failure without exposing organization details. */
function showHostFailure(): void {
  if (statusDot) statusDot.className = "status-dot error";
  if (statusText) statusText.textContent = "Azure DevOps host connection failed.";
  if (hostMeta) hostMeta.textContent = "Reload the page or check that the extension is enabled.";
}

function setMessage(element: HTMLElement | null, message: string, kind: "info" | "success" | "error" = "info"): void {
  if (!element) return;
  element.textContent = message;
  element.className = `status-message${kind === "info" ? "" : ` ${kind}`}`;
}

/** Switch the visible project tab and preserve it in the iframe hash. */
function activateTab(tab: string): void {
  const known = tabs.some((button) => button.dataset.tab === tab) ? tab : "general";
  for (const button of tabs) {
    const active = button.dataset.tab === known;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  }
  for (const panel of panels) {
    panel.hidden = panel.dataset.panel !== known;
  }
  if (window.location.hash !== `#${known}`) {
    history.replaceState(null, "", `#${known}`);
  }
}

/** Fetch repository names with the extension's read-only code token. */
async function fetchRepositories(): Promise<Repository[]> {
  const token = await SDK.getAccessToken();
  const response = await fetch(
    `${organizationUrl(hostName)}/${encodeURIComponent(projectName)}/_apis/git/repositories?api-version=7.1`,
    { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, redirect: "error" }
  );
  if (!response.ok) throw new Error(`Repository request failed with HTTP ${response.status}.`);
  const value = await response.json() as { value?: unknown };
  if (!Array.isArray(value.value)) throw new Error("Repository response has an invalid shape.");
  return value.value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    .filter((item) => typeof item.id === "string" && typeof item.name === "string")
    .map((item) => ({ id: item.id as string, name: item.name as string }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Render repository checkboxes from persisted settings and current discovery. */
function renderRepositories(): void {
  if (!repositoryList) return;
  repositoryList.replaceChildren();
  for (const repository of repositories) {
    const label = document.createElement("label");
    label.className = "switch-row";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.repositoryId = repository.id;
    // Keep the repository's own switch visible even when the organization
    // master switch is off; the master switch is enforced separately.
    input.checked = settings.repositories[repository.id]?.enabled === true;
    input.disabled = !projectEnabled?.checked;
    const text = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = repository.name;
    const state = document.createElement("small");
    state.textContent = input.checked ? "Reviews enabled" : "Reviews disabled";
    input.addEventListener("change", () => {
      state.textContent = input.checked ? "Reviews enabled" : "Reviews disabled";
    });
    text.append(name, state);
    label.append(input, text);
    repositoryList.append(label);
  }
  if (repositories.length === 0) {
    repositoryList.textContent = "No repositories were found in this project.";
  }
  syncProjectState();
}

/** Disable repository controls when the project switch is off. */
function syncProjectState(): void {
  const projectOn = projectEnabled?.checked === true;
  for (const input of repositoryList?.querySelectorAll<HTMLInputElement>("input[data-repository-id]") ?? []) {
    input.disabled = !projectOn;
    const row = input.closest<HTMLElement>(".switch-row");
    row?.classList.toggle("inactive", !projectOn);
    const state = row?.querySelector<HTMLElement>("small");
    if (state) {
      state.textContent = projectOn
        ? (input.checked ? "Reviews enabled" : "Reviews disabled")
        : "Project disabled";
    }
  }
}

async function save(): Promise<void> {
  if (!projectEnabled || !repositoryList) return;
  const next: ProjectSettings = {
    ...settings,
    enabled: projectEnabled.checked,
    defaultRepositoryEnabled: (newRepositoryDefault?.value as RepositoryDefault | undefined) ?? "inherit",
    repositories: { ...settings.repositories }
  };
  for (const input of repositoryList.querySelectorAll<HTMLInputElement>("input[data-repository-id]")) {
    const repositoryId = input.dataset.repositoryId;
    if (!repositoryId) continue;
    next.repositories[repositoryId] = {
      ...(next.repositories[repositoryId] ?? { enabled: false }),
      enabled: input.checked
    };
  }
  if (saveButton) saveButton.disabled = true;
  setMessage(saveStatus, "Saving...");
  try {
    await saveSetting(`project.${projectId}`, next);
    settings = next;
    setMessage(saveStatus, "Settings saved.", "success");
  } catch {
    setMessage(saveStatus, "Settings could not be saved. Reload and try again.", "error");
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

async function main(): Promise<void> {
  try {
    const context = await initializeHost();
    hostName = context.host.name;
    const project = SDK.getWebContext().project;
    if (!project?.id || !project.name) throw new Error("No project context.");
    projectId = project.id;
    projectName = project.name;
    if (statusDot) statusDot.className = "status-dot ready";
    if (statusText) statusText.textContent = "Connected to Azure DevOps.";
    if (hostMeta) hostMeta.textContent = `${hostName} - ${project.name} - Masthead ${context.extension.version}`;
    if (aboutVersion) aboutVersion.textContent = context.extension.version;
    await notifyHostLoaded();
  } catch {
    showHostFailure();
    await notifyHostFailed("Masthead could not initialize the project settings page.");
    return;
  }

  activateTab(window.location.hash.replace(/^#/, ""));

  try {
    organization = normalizeOrganizationSettings(await loadSetting<OrganizationSettings>("organization", defaultOrganizationSettings()));
    if (orgState) orgState.textContent = organization.enabled ? "enabled" : "disabled";
    const fallback: ProjectSettings = {
      ...defaultProjectSettings(),
      enabled: organization.defaultProjectEnabled
    };
    settings = normalizeProjectSettings(await loadSetting<ProjectSettings>(`project.${projectId}`, fallback));
    repositories = await fetchRepositories();
    settings = seedProjectRepositories(organization, settings, repositories.map((repository) => repository.id));
    await saveSetting(`project.${projectId}`, settings);
    if (projectEnabled) projectEnabled.checked = settings.enabled;
    if (newRepositoryDefault) newRepositoryDefault.value = settings.defaultRepositoryEnabled;
    renderRepositories();
    const inherited = settings.defaultRepositoryEnabled === "inherit"
      ? ` (organization default: ${organization.defaultRepositoryEnabled ? "enabled" : "disabled"})`
      : "";
    setMessage(repositoryStatus, `${repositories.length} repositories discovered. New repositories use the project default${inherited}.`);
  } catch (error) {
    setMessage(repositoryStatus, error instanceof Error ? error.message : "Project settings could not be loaded.", "error");
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void save();
  });
  projectEnabled?.addEventListener("change", syncProjectState);
  for (const tab of tabs) {
    tab.addEventListener("click", () => activateTab(tab.dataset.tab ?? "general"));
  }
}

void main();

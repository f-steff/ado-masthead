// Organization configuration is application data. Provider keys and repository
// content are deliberately absent from this page and its storage.
import * as SDK from "azure-devops-extension-sdk";
import {
  defaultOrganizationSettings,
  defaultProjectSettings,
  normalizeOrganizationSettings,
  normalizeProjectSettings,
  OrganizationSettings,
  ProjectSettings
} from "../../settings";
import { defaultReviewProfile, resolveReviewProfile } from "../../review/lenses";
import { ModelCatalog, normalizeModelCatalog } from "../../models/catalog";
import { initializeHost, notifyHostFailed, notifyHostLoaded, organizationUrl } from "../shared/host";
import { renderLensExamples } from "../shared/lens-examples";
import { fillModelOptions } from "../shared/model-suggestions";
import { filterPipelines, pipelineLabel, PipelineOption } from "../shared/pipelines";
import { renderLensOptions, selectedLenses } from "../shared/review-profile";
import { loadSetting, saveSetting } from "../shared/storage";

interface ProjectRow {
  id: string;
  name: string;
  settings: ProjectSettings;
}

const statusText = document.querySelector<HTMLElement>("#host-status");
const statusDot = document.querySelector<HTMLElement>("#status-dot");
const hostMeta = document.querySelector<HTMLElement>("#host-meta");
const form = document.querySelector<HTMLFormElement>("#settings-form");
const enabled = document.querySelector<HTMLInputElement>("#org-enabled");
const defaultProject = document.querySelector<HTMLSelectElement>("#default-project");
const defaultRepository = document.querySelector<HTMLSelectElement>("#default-repository");
const projectList = document.querySelector<HTMLElement>("#project-list");
const projectStatus = document.querySelector<HTMLElement>("#project-status");
const nativeRadio = document.querySelector<HTMLInputElement>("#delivery-native");
const brokerRadio = document.querySelector<HTMLInputElement>("#delivery-broker");
const nativeChoice = document.querySelector<HTMLElement>("#native-choice");
const brokerChoice = document.querySelector<HTMLElement>("#broker-choice");
const nativeWebhook = document.querySelector<HTMLInputElement>("#native-webhook");
const brokerUrl = document.querySelector<HTMLInputElement>("#broker-url");
const pipelineSearch = document.querySelector<HTMLInputElement>("#pipeline-search");
const pipelineProject = document.querySelector<HTMLSelectElement>("#pipeline-project");
const pipelineOptions = document.querySelector<HTMLDataListElement>("#pipeline-options");
const pipelineSelected = document.querySelector<HTMLElement>("#pipeline-selected");
const saveStatus = document.querySelector<HTMLElement>("#save-status");
const pipelineStatus = document.querySelector<HTMLElement>("#pipeline-status");
const validateButton = document.querySelector<HTMLButtonElement>("#validate-pipeline");
const clearPipelineButton = document.querySelector<HTMLButtonElement>("#clear-pipeline");
const createProject = document.querySelector<HTMLSelectElement>("#pipeline-create-project");
const createRepository = document.querySelector<HTMLSelectElement>("#pipeline-create-repository");
const createName = document.querySelector<HTMLInputElement>("#pipeline-create-name");
const createPath = document.querySelector<HTMLInputElement>("#pipeline-create-path");
const installPipelineButton = document.querySelector<HTMLButtonElement>("#install-pipeline");
const deletePipelineButton = document.querySelector<HTMLButtonElement>("#delete-pipeline");
const createStatus = document.querySelector<HTMLElement>("#create-status");
const saveButton = document.querySelector<HTMLButtonElement>("#save-settings");
const aboutVersion = document.querySelector<HTMLElement>("#about-version");
const extensionId = document.querySelector<HTMLElement>("#extension-id");
const extensionPublisher = document.querySelector<HTMLElement>("#extension-publisher");
const reviewProvider = document.querySelector<HTMLSelectElement>("#review-provider");
const reviewModel = document.querySelector<HTMLInputElement>("#review-model");
const reviewModelOptions = document.querySelector<HTMLDataListElement>("#review-model-options");
const catalogStatus = document.querySelector<HTMLElement>("#catalog-status");
const reasoningEffort = document.querySelector<HTMLSelectElement>("#reasoning-effort");
const thinkingBudget = document.querySelector<HTMLSelectElement>("#thinking-budget");
const reasoningField = document.querySelector<HTMLElement>("#reasoning-field");
const thinkingField = document.querySelector<HTMLElement>("#thinking-field");
const orgLensList = document.querySelector<HTMLElement>("#org-lens-list");
const orgReviewGuide = document.querySelector<HTMLInputElement>("#org-review-guide");
const orgExampleTabs = document.querySelector<HTMLElement>("#org-example-tabs");
const orgExamplePanel = document.querySelector<HTMLElement>("#org-example-panel");
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-tab]"));
const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-panel]"));

let hostName = "";
let currentTab = "general";
let modelCatalog: ModelCatalog = {};
let settings = defaultOrganizationSettings();
let projects: ProjectRow[] = [];
let pipelines: PipelineOption[] = [];
let selectedPipeline: PipelineOption | undefined;
let pipelineRepositories: Array<{ id: string; name: string }> = [];

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

/** Switch the visible settings tab and preserve it in the iframe hash. */
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
  currentTab = known;
  if (window.location.hash !== `#${known}`) {
    history.replaceState(null, "", `#${known}`);
  }
  if (known === "setup" && selectedPipeline) {
    void validatePipeline(true);
  }
}

/** Fetch the organization's projects for the per-project gate list. */
async function fetchProjects(): Promise<Array<{ id: string; name: string }>> {
  const token = await SDK.getAccessToken();
  const response = await fetch(`${organizationUrl(hostName)}/_apis/projects?api-version=7.1`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    redirect: "error"
  });
  if (!response.ok) throw new Error(`Projects request failed with HTTP ${response.status}.`);
  const value = await response.json() as { value?: unknown };
  if (!Array.isArray(value.value)) throw new Error("Projects response has an invalid shape.");
  return value.value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    .filter((item) => typeof item.id === "string" && typeof item.name === "string")
    .map((item) => ({ id: item.id as string, name: item.name as string }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Rebuild the datalist with a case-insensitive substring filter. */
function renderPipelineOptions(query = ""): void {
  if (!pipelineOptions) return;
  pipelineOptions.replaceChildren();
  const project = pipelineProject?.value ?? "";
  const matches = filterPipelines(pipelines, query)
    .filter((pipeline) => !project || pipeline.project === project);
  for (const pipeline of matches) {
    const option = document.createElement("option");
    option.value = pipelineLabel(pipeline);
    option.label = `${pipeline.project} pipeline`;
    pipelineOptions.append(option);
  }
}

/** Populate the project selector used by the pipeline installer. */
function renderCreateProjectOptions(): void {
  if (!createProject) return;
  const current = createProject.value || settings.pipelineProject || "";
  createProject.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a project";
  createProject.append(placeholder);
  for (const project of projects.map((item) => item.name).sort((left, right) => left.localeCompare(right))) {
    const option = document.createElement("option");
    option.value = project;
    option.textContent = project;
    createProject.append(option);
  }
  createProject.value = [...createProject.options].some((option) => option.value === current) ? current : "";
  if (createProject.value) {
    void loadPipelineRepositories(createProject.value);
  }
}

/** Fetch repositories for the installer's selected project. */
async function loadPipelineRepositories(project: string): Promise<void> {
  if (!createRepository) return;
  pipelineRepositories = [];
  createRepository.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = project ? "Loading repositories..." : "Select a repository";
  createRepository.append(placeholder);
  if (!project) return;
  try {
    const token = await SDK.getAccessToken();
    const response = await fetch(
      `${organizationUrl(hostName)}/${encodeURIComponent(project)}/_apis/git/repositories?api-version=7.1`,
      { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, redirect: "error" }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value = await response.json() as { value?: unknown };
    const entries = Array.isArray(value.value) ? value.value : [];
    pipelineRepositories = entries
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .filter((item) => typeof item.id === "string" && typeof item.name === "string")
      .map((item) => ({ id: item.id as string, name: item.name as string }))
      .sort((left, right) => left.name.localeCompare(right.name));
    createRepository.replaceChildren();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = pipelineRepositories.length ? "Select a repository" : "No repositories found";
    createRepository.append(empty);
    for (const repository of pipelineRepositories) {
      const option = document.createElement("option");
      option.value = repository.id;
      option.textContent = repository.name;
      createRepository.append(option);
    }
  } catch {
    createRepository.replaceChildren();
    const failed = document.createElement("option");
    failed.value = "";
    failed.textContent = "Repositories could not be loaded";
    createRepository.append(failed);
    setMessage(createStatus, "Repositories could not be loaded for this project.", "error");
  }
}

/** Create a YAML pipeline definition from a trusted repository. */
async function installPipeline(): Promise<void> {
  const project = createProject?.value ?? "";
  const repositoryId = createRepository?.value ?? "";
  const name = createName?.value.trim() ?? "";
  const path = createPath?.value.trim() ?? "";
  if (!project || !repositoryId || !name || !path.startsWith("/")) {
    setMessage(createStatus, "Select a project/repository and provide a pipeline name and absolute YAML path.", "error");
    return;
  }
  if (installPipelineButton) installPipelineButton.disabled = true;
  setMessage(createStatus, "Checking the YAML file...");
  try {
    const token = await SDK.getAccessToken();
    const item = await fetch(
      `${organizationUrl(hostName)}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/items?path=${encodeURIComponent(path)}&api-version=7.1`,
      { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, redirect: "error" }
    );
    if (!item.ok) throw new Error(`YAML file was not found (HTTP ${item.status}).`);
    setMessage(createStatus, "Creating the pipeline definition...");
    const response = await fetch(
      `${organizationUrl(hostName)}/${encodeURIComponent(project)}/_apis/pipelines?api-version=7.1`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          name,
          folder: "Masthead",
          configuration: { type: "yaml", path, repository: { id: repositoryId, type: "azureReposGit" } }
        }),
        redirect: "error"
      }
    );
    if (!response.ok) throw new Error(`Pipeline creation failed with HTTP ${response.status}.`);
    const created = await response.json() as { id?: unknown; name?: unknown };
    if (typeof created.id !== "number") throw new Error("Azure DevOps did not return the pipeline id.");
    selectedPipeline = { project, id: created.id, name: typeof created.name === "string" ? created.name : name };
    if (pipelineSearch) pipelineSearch.value = pipelineLabel(selectedPipeline);
    if (pipelineProject) pipelineProject.value = project;
    if (pipelineSelected) pipelineSelected.textContent = `Selected ${pipelineLabel(selectedPipeline)}.`;
    await save();
    setMessage(createStatus, `Pipeline ${selectedPipeline.name} installed and bound.`, "success");
  } catch (error) {
    setMessage(createStatus, error instanceof Error ? error.message : "Pipeline installation failed.", "error");
  } finally {
    if (installPipelineButton) installPipelineButton.disabled = false;
  }
}

/** Delete the pipeline definition currently bound above, not its repository. */
async function deletePipeline(): Promise<void> {
  const project = selectedPipeline?.project ?? settings.pipelineProject ?? "";
  const id = selectedPipeline?.id ?? settings.pipelineId;
  if (!project || !id) {
    setMessage(createStatus, "Select or install a pipeline before deleting it.", "error");
    return;
  }
  if (!window.confirm(`Delete the Azure Pipelines definition "${selectedPipeline?.name ?? id}"? This does not delete repositories or pull request threads.`)) {
    return;
  }
  if (deletePipelineButton) deletePipelineButton.disabled = true;
  setMessage(createStatus, "Deleting the pipeline definition...");
  try {
    const token = await SDK.getAccessToken();
    const response = await fetch(
      `${organizationUrl(hostName)}/${encodeURIComponent(project)}/_apis/build/definitions/${id}?api-version=7.1`,
      { method: "DELETE", headers: { authorization: `Bearer ${token}`, accept: "application/json" }, redirect: "error" }
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Pipeline deletion failed with HTTP ${response.status}.`);
    }
    selectedPipeline = undefined;
    if (pipelineSearch) pipelineSearch.value = "";
    if (pipelineSelected) pipelineSelected.textContent = "No central pipeline selected.";
    await save();
    setMessage(createStatus, "Pipeline definition deleted and binding cleared.", "success");
  } catch (error) {
    setMessage(createStatus, error instanceof Error ? error.message : "Pipeline deletion failed.", "error");
  } finally {
    if (deletePipelineButton) deletePipelineButton.disabled = false;
  }
}

/** Keep the project filter aligned with the discovered project list. */
function renderPipelineProjectOptions(discovered: Array<{ name: string }>): void {
  if (!pipelineProject) return;
  const current = pipelineProject.value;
  pipelineProject.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All projects";
  pipelineProject.append(all);
  for (const name of discovered.map((project) => project.name).sort((left, right) => left.localeCompare(right))) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    pipelineProject.append(option);
  }
  pipelineProject.value = [...pipelineProject.options].some((option) => option.value === current) ? current : "";
}

/** Resolve the current input to an exact listed pipeline, if possible. */
function selectPipelineFromSearch(): void {
  const value = pipelineSearch?.value.trim() ?? "";
  selectedPipeline = value ? pipelines.find((pipeline) => pipelineLabel(pipeline) === value) : undefined;
  if (!pipelineSelected) return;
  if (!value) {
    pipelineSelected.textContent = "No central pipeline selected.";
  } else if (selectedPipeline) {
    pipelineSelected.textContent = `Selected ${pipelineLabel(selectedPipeline)}.`;
  } else {
    pipelineSelected.textContent = "Select a pipeline from the list.";
  }
}

/** Restore a saved pipeline even when the current identity cannot list it. */
function restorePipelineSelection(): void {
  if (!settings.pipelineProject || !settings.pipelineId) {
    if (pipelineSearch) pipelineSearch.value = "";
    selectedPipeline = undefined;
    if (pipelineSelected) pipelineSelected.textContent = "No central pipeline selected.";
    return;
  }
  const match = pipelines.find((pipeline) =>
    pipeline.project === settings.pipelineProject && pipeline.id === settings.pipelineId
  );
  selectedPipeline = match ?? {
    project: settings.pipelineProject,
    id: settings.pipelineId,
    name: settings.pipelineName ?? "Saved pipeline"
  };
  if (pipelineSearch) pipelineSearch.value = pipelineLabel(selectedPipeline);
  if (pipelineProject) {
    pipelineProject.value = selectedPipeline.project;
    renderPipelineOptions(pipelineSearch?.value ?? "");
  }
  if (pipelineSelected) pipelineSelected.textContent = `Selected ${pipelineLabel(selectedPipeline)}.`;
}

/** List pipelines in each visible project; a failed project is skipped. */
async function fetchPipelines(discovered: Array<{ id: string; name: string }>): Promise<PipelineOption[]> {
  const token = await SDK.getAccessToken();
  const results = await Promise.all(discovered.map(async (project) => {
    try {
      const response = await fetch(
        `${organizationUrl(hostName)}/${encodeURIComponent(project.name)}/_apis/pipelines?api-version=7.1`,
        { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, redirect: "error" }
      );
      if (!response.ok) return [];
      const value = await response.json() as { value?: unknown };
      if (!Array.isArray(value.value)) return [];
      return value.value
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
        .filter((item) => typeof item.id === "number" && Number.isSafeInteger(item.id) && item.id > 0 && typeof item.name === "string")
        .map((item) => ({ project: project.name, id: item.id as number, name: item.name as string }));
    } catch {
      return [];
    }
  }));
  return results.flat().sort((left, right) => pipelineLabel(left).localeCompare(pipelineLabel(right)));
}

/** Render project switches without creating a settings document until Save. */
function renderProjectList(): void {
  if (!projectList) return;
  projectList.replaceChildren();
  const header = document.createElement("div");
  header.className = "project-row project-header";
  const headerName = document.createElement("span");
  headerName.textContent = "Project";
  const headerState = document.createElement("span");
  headerState.textContent = "Reviews";
  header.append(headerName, headerState);
  projectList.append(header);

  for (const project of projects) {
    const row = document.createElement("div");
    row.className = "project-row";
    const name = document.createElement("span");
    name.className = "project-name";
    name.textContent = project.name;
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = `project-${project.id}`;
    input.checked = project.settings.enabled;
    input.addEventListener("change", () => {
      project.settings = { ...project.settings, enabled: input.checked };
      syncProjectUseState();
    });
    const state = document.createElement("span");
    state.textContent = input.checked ? "Enabled" : "Disabled";
    label.append(input, state);
    row.append(name, label);
    projectList.append(row);
  }

  if (projects.length === 0) {
    projectList.textContent = "No projects were found.";
  }
  syncProjectUseState();
}

/** The organization master switch makes project controls visibly inactive. */
function syncProjectUseState(): void {
  if (!projectList) return;
  const masterEnabled = enabled?.checked === true;
  for (const row of projectList.querySelectorAll<HTMLElement>(".project-row")) {
    const input = row.querySelector<HTMLInputElement>("input[type=checkbox]");
    if (!input) continue;
    input.disabled = !masterEnabled;
    row.classList.toggle("inactive", !masterEnabled);
    const state = row.querySelector<HTMLElement>("label span:last-child");
    if (state) {
      state.textContent = masterEnabled ? (input.checked ? "Enabled" : "Disabled") : "Not used";
    }
  }
}

/** Render persisted organization fields and default selectors. */
function renderOrganization(value: OrganizationSettings): void {
  settings = value;
  if (enabled) enabled.checked = value.enabled;
  if (defaultProject) defaultProject.value = value.defaultProjectEnabled ? "enabled" : "disabled";
  if (defaultRepository) defaultRepository.value = value.defaultRepositoryEnabled ? "enabled" : "disabled";
  if (nativeRadio) nativeRadio.checked = value.deploymentMode === "native";
  if (brokerRadio) brokerRadio.checked = value.deploymentMode === "broker";
  nativeChoice?.classList.toggle("selected", value.deploymentMode === "native");
  brokerChoice?.classList.toggle("selected", value.deploymentMode === "broker");
  if (nativeWebhook) nativeWebhook.value = value.nativeWebhookName ?? "MastheadPR";
  if (brokerUrl) brokerUrl.value = value.brokerUrl ?? "";
  if (reviewProvider) reviewProvider.value = value.provider ?? "";
  if (reviewModel) reviewModel.value = value.model ?? "";
  fillModelOptions(reviewModelOptions, value.provider, modelCatalog);
  renderCatalogStatus();
  if (reasoningEffort) reasoningEffort.value = value.reasoningEffort ?? "";
  if (thinkingBudget) thinkingBudget.value = value.thinkingBudget ? String(value.thinkingBudget) : "";
  syncProviderOptions();
  const profile = resolveReviewProfile(value.profile ?? defaultReviewProfile());
  renderLensOptions(orgLensList, profile.enabledLenses);
  if (orgReviewGuide) orgReviewGuide.checked = profile.reviewGuide;
}

/** Cached suggestions remain usable even when the catalogue pipeline is stale. */
function renderCatalogStatus(): void {
  if (!catalogStatus) return;
  const provider = reviewProvider?.value;
  const entry = provider === "anthropic" || provider === "openai" || provider === "deepseek"
    ? modelCatalog[provider]
    : undefined;
  if (!entry?.refreshedAt) {
    catalogStatus.textContent = "Using built-in model suggestions. The separate model catalogue pipeline has not refreshed this provider yet.";
    return;
  }
  const date = new Date(entry.refreshedAt);
  catalogStatus.textContent = Number.isFinite(date.getTime())
    ? `Model suggestions last refreshed ${date.toLocaleString()}. Cached values remain available while the next refresh runs.`
    : "Using cached model suggestions. The last refresh time is unavailable.";
}

/** Show only the reasoning control that the chosen provider can consume. */
function syncProviderOptions(): void {
  const provider = reviewProvider?.value ?? "";
  if (reasoningField) reasoningField.hidden = provider === "anthropic" || provider === "deepseek";
  if (thinkingField) thinkingField.hidden = provider === "openai" || provider === "deepseek";
}

function syncDeliveryChoice(): void {
  nativeChoice?.classList.toggle("selected", nativeRadio?.checked === true);
  brokerChoice?.classList.toggle("selected", brokerRadio?.checked === true);
}

/** Validate ordinary URLs; provider secrets never enter this form. */
function validBrokerUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch {
    return false;
  }
}

/**
 * Save organization settings and every rendered project switch. Project rows
 * already hold their repository maps, so this does not erase child settings.
 */
async function save(): Promise<void> {
  if (!enabled || !nativeRadio || !brokerRadio) return;
  const selectedMode = brokerRadio.checked ? "broker" : "native";
  const url = brokerUrl?.value.trim() ?? "";
  if (!validBrokerUrl(url)) {
    setMessage(saveStatus, "Broker URL must use HTTPS (or HTTP on loopback).", "error");
    return;
  }
  const pipelineValue = pipelineSearch?.value.trim() ?? "";
  if (pipelineValue && !selectedPipeline) {
    setMessage(saveStatus, "Select a central pipeline from the list or clear the field.", "error");
    return;
  }
  const next: OrganizationSettings = {
    ...settings,
    enabled: enabled.checked,
    defaultProjectEnabled: defaultProject?.value !== "disabled",
    defaultRepositoryEnabled: defaultRepository?.value === "enabled",
    deploymentMode: selectedMode,
    nativeWebhookName: nativeWebhook?.value.trim() || "MastheadPR",
    brokerUrl: url || undefined,
    pipelineProject: selectedPipeline?.project,
    pipelineId: selectedPipeline?.id,
    pipelineName: selectedPipeline?.name,
    brokerVerified: false,
    provider: reviewProvider?.value || undefined,
    model: reviewModel?.value.trim() || undefined,
    reasoningEffort: (reasoningEffort?.value as "low" | "medium" | "high" | "") || undefined,
    thinkingBudget: thinkingBudget?.value ? Number(thinkingBudget.value) : undefined,
    profile: resolveReviewProfile({
      enabledLenses: selectedLenses(orgLensList),
      reviewGuide: orgReviewGuide?.checked !== false
    })
  };
  if (saveButton) saveButton.disabled = true;
  setMessage(saveStatus, "Saving...");
  try {
    await saveSetting("organization", next);
    await Promise.all(projects.map((project) => saveSetting(`project.${project.id}`, project.settings)));
    settings = next;
    setMessage(saveStatus, "Settings saved.", "success");
  } catch {
    setMessage(saveStatus, "Settings could not be saved. Reload and try again.", "error");
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

/** Validate that the configured central pipeline is readable by this identity. */
async function validatePipeline(quiet = false): Promise<void> {
  if (!selectedPipeline) {
    if (!quiet) setMessage(pipelineStatus, "Select a pipeline from the searchable list first.", "error");
    return;
  }
  if (validateButton) validateButton.disabled = true;
  setMessage(pipelineStatus, "Checking pipeline...");
  try {
    const token = await SDK.getAccessToken();
    const response = await fetch(
      `${organizationUrl(hostName)}/${encodeURIComponent(selectedPipeline.project)}/_apis/pipelines/${selectedPipeline.id}?api-version=7.1`,
      { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, redirect: "error" }
    );
    if (response.ok) {
      const value = await response.json().catch(() => undefined) as { name?: unknown } | undefined;
      const actualName = typeof value?.name === "string" ? value.name : selectedPipeline.name;
      if (settings.pipelineName && actualName !== settings.pipelineName) {
        setMessage(
          pipelineStatus,
          `Pipeline is readable, but its name changed from "${settings.pipelineName}" to "${actualName}". Save settings to repair the binding.`,
          "error"
        );
      } else {
        setMessage(pipelineStatus, "Pipeline found and readable by this identity.", "success");
      }
    } else {
      setMessage(pipelineStatus, `Pipeline was not accessible (HTTP ${response.status}).`, "error");
    }
  } catch {
    setMessage(pipelineStatus, "Pipeline validation could not be completed.", "error");
  } finally {
    if (validateButton) validateButton.disabled = false;
  }
}

async function loadProjects(): Promise<void> {
  setMessage(projectStatus, "Loading projects...");
  try {
    const discovered = await fetchProjects();
    const rows = await Promise.all(discovered.map(async (project) => {
      const fallback: ProjectSettings = {
        ...defaultProjectSettings(),
        enabled: settings.defaultProjectEnabled
      };
      const stored = normalizeProjectSettings(await loadSetting<ProjectSettings>(`project.${project.id}`, fallback));
      return { ...project, settings: stored };
    }));
    projects = rows;
    renderProjectList();
    renderCreateProjectOptions();
    renderPipelineProjectOptions(discovered);
    pipelines = await fetchPipelines(discovered);
    renderPipelineOptions();
    restorePipelineSelection();
    if (currentTab === "setup" && selectedPipeline) {
      void validatePipeline(true);
    }
    setMessage(projectStatus, `${projects.length} projects and ${pipelines.length} pipelines loaded.`, "success");
  } catch {
    projects = [];
    pipelines = [];
    if (projectList) projectList.textContent = "Projects could not be loaded.";
    renderPipelineOptions();
    restorePipelineSelection();
    setMessage(projectStatus, "Project list could not be loaded. Organization settings can still be saved.", "error");
  }
}

async function main(): Promise<void> {
  try {
    const context = await initializeHost();
    hostName = context.host.name;
    if (statusDot) statusDot.className = "status-dot ready";
    if (statusText) statusText.textContent = "Connected to Azure DevOps.";
    if (hostMeta) hostMeta.textContent = `${hostName} - Masthead ${context.extension.version}`;
    if (aboutVersion) aboutVersion.textContent = context.extension.version;
    if (extensionId) extensionId.textContent = context.extension.extensionId;
    if (extensionPublisher) extensionPublisher.textContent = context.extension.publisherId;
    await notifyHostLoaded();
  } catch {
    showHostFailure();
    await notifyHostFailed("Masthead could not initialize the Azure DevOps host.");
    return;
  }

  const initialTab = window.location.hash.replace(/^#/, "");
  renderLensExamples(orgExampleTabs, orgExamplePanel);
  activateTab(initialTab);

  try {
    modelCatalog = normalizeModelCatalog(await loadSetting<ModelCatalog>("modelCatalog", {}));
  } catch {
    modelCatalog = {};
  }
  try {
    renderOrganization(normalizeOrganizationSettings(await loadSetting<OrganizationSettings>("organization", defaultOrganizationSettings())));
  } catch {
    setMessage(saveStatus, "Organization settings could not be loaded. The host connection is still working.", "error");
  }
  await loadProjects();

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void save();
  });
  validateButton?.addEventListener("click", () => {
    void validatePipeline();
  });
  clearPipelineButton?.addEventListener("click", () => {
    selectedPipeline = undefined;
    if (pipelineSearch) pipelineSearch.value = "";
    if (pipelineSelected) pipelineSelected.textContent = "No central pipeline selected.";
    setMessage(pipelineStatus, "Pipeline binding cleared. Save settings to persist it.");
  });
  createProject?.addEventListener("change", () => {
    void loadPipelineRepositories(createProject.value);
  });
  installPipelineButton?.addEventListener("click", () => {
    void installPipeline();
  });
  deletePipelineButton?.addEventListener("click", () => {
    void deletePipeline();
  });
  nativeRadio?.addEventListener("change", syncDeliveryChoice);
  brokerRadio?.addEventListener("change", syncDeliveryChoice);
  enabled?.addEventListener("change", syncProjectUseState);
  reviewProvider?.addEventListener("change", () => {
    fillModelOptions(reviewModelOptions, reviewProvider.value, modelCatalog);
    renderCatalogStatus();
    syncProviderOptions();
  });
  pipelineSearch?.addEventListener("input", () => {
    renderPipelineOptions(pipelineSearch.value);
    selectPipelineFromSearch();
  });
  pipelineSearch?.addEventListener("change", selectPipelineFromSearch);
  pipelineProject?.addEventListener("change", () => {
    renderPipelineOptions(pipelineSearch?.value ?? "");
    selectPipelineFromSearch();
  });
  for (const tab of tabs) {
    tab.addEventListener("click", () => activateTab(tab.dataset.tab ?? "general"));
  }
}

void main();

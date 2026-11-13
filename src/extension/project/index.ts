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
import { defaultReviewProfile, resolveReviewProfile } from "../../review/lenses";
import { ModelCatalog, normalizeModelCatalog } from "../../models/catalog";
import { initializeHost, notifyHostFailed, notifyHostLoaded, organizationUrl } from "../shared/host";
import { renderLensExamples } from "../shared/lens-examples";
import { fillModelOptions } from "../shared/model-suggestions";
import {
  branchPolicyUrl,
  defaultBranchName,
  policyConfigurationsUrl,
  summarizeBranchPolicies
} from "../shared/policy-state";
import type { BranchPolicySummary } from "../shared/policy-state";
import { renderLensOptions, selectedLenses, setLensOptionsDisabled } from "../shared/review-profile";
import { loadSetting, saveSetting } from "../shared/storage";

interface Repository {
  id: string;
  name: string;
  defaultBranch?: string;
}

interface PolicyRead {
  repository: Repository;
  summary?: BranchPolicySummary;
  error?: string;
}

const statusText = document.querySelector<HTMLElement>("#host-status");
const statusDot = document.querySelector<HTMLElement>("#status-dot");
const hostMeta = document.querySelector<HTMLElement>("#host-meta");
const projectEnabled = document.querySelector<HTMLInputElement>("#project-enabled");
const newRepositoryDefault = document.querySelector<HTMLSelectElement>("#new-repository-default");
const orgState = document.querySelector<HTMLElement>("#org-state");
const repositoryList = document.querySelector<HTMLElement>("#repository-list");
const repositoryStatus = document.querySelector<HTMLElement>("#repository-status");
const policyList = document.querySelector<HTMLElement>("#policy-list");
const policyStatus = document.querySelector<HTMLElement>("#policy-status");
const refreshPoliciesButton = document.querySelector<HTMLButtonElement>("#refresh-policies");
const saveStatus = document.querySelector<HTMLElement>("#save-status");
const saveButton = document.querySelector<HTMLButtonElement>("#save-project");
const aboutVersion = document.querySelector<HTMLElement>("#about-version");
const inheritProfile = document.querySelector<HTMLInputElement>("#inherit-profile");
const orgProfileSummary = document.querySelector<HTMLElement>("#org-profile-summary");
const projectProvider = document.querySelector<HTMLSelectElement>("#project-review-provider");
const projectModel = document.querySelector<HTMLInputElement>("#project-review-model");
const projectModelOptions = document.querySelector<HTMLDataListElement>("#project-model-options");
const allModelOptions = document.querySelector<HTMLDataListElement>("#all-model-options");
const projectLensList = document.querySelector<HTMLElement>("#project-lens-list");
const projectReviewGuide = document.querySelector<HTMLInputElement>("#project-review-guide");
const projectExampleTabs = document.querySelector<HTMLElement>("#project-example-tabs");
const projectExamplePanel = document.querySelector<HTMLElement>("#project-example-panel");
const repoProfileList = document.querySelector<HTMLElement>("#repo-profile-list");
const form = document.querySelector<HTMLFormElement>("#project-form");
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-tab]"));
const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-panel]"));

let hostName = "";
let projectId = "";
let projectName = "";
let settings: ProjectSettings = defaultProjectSettings();
let organization: OrganizationSettings = defaultOrganizationSettings();
let modelCatalog: ModelCatalog = {};
let repositories: Repository[] = [];
let policyReads: PolicyRead[] = [];
let policiesLoading = false;

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
    .map((item) => ({
      id: item.id as string,
      name: item.name as string,
      ...(typeof item.defaultBranch === "string" && item.defaultBranch
        ? { defaultBranch: item.defaultBranch }
        : {})
    }))
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
      renderPolicies();
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

/** Keep policy reads bounded so a large project does not flood ADO. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function readRepositoryPolicies(repository: Repository, token: string): Promise<PolicyRead> {
  if (!repository.defaultBranch) {
    return { repository, error: "Default branch is unknown." };
  }
  try {
    const response = await fetch(
      policyConfigurationsUrl(organizationUrl(hostName), projectName, repository.id, repository.defaultBranch),
      { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, redirect: "error" }
    );
    if (!response.ok) return { repository, error: `HTTP ${response.status}` };
    const value = await response.json() as { value?: unknown };
    if (!Array.isArray(value.value)) return { repository, error: "Invalid policy response." };
    return { repository, summary: summarizeBranchPolicies(value.value, repository.id, repository.defaultBranch) };
  } catch {
    return { repository, error: "Policy request failed." };
  }
}

/** Read policy state for the default branch of every discovered repository. */
async function loadCompletionPolicies(): Promise<void> {
  if (policiesLoading) return;
  policiesLoading = true;
  policyReads = [];
  renderPolicies();
  if (refreshPoliciesButton) refreshPoliciesButton.disabled = true;
  setMessage(policyStatus, "Reading branch policies...");
  try {
    if (repositories.length === 0) {
      setMessage(policyStatus, "No repositories are available to inspect.", "error");
      return;
    }
    const token = await SDK.getAccessToken();
    policyReads = await mapLimit(repositories, 4, (repository) => readRepositoryPolicies(repository, token));
    renderPolicies();
    const failed = policyReads.filter((read) => read.error).length;
    setMessage(
      policyStatus,
      failed === 0
        ? `Policy state read for ${policyReads.length} repositories.`
        : `Policy state read for ${policyReads.length - failed} repositories; ${failed} could not be read.`,
      failed === 0 ? "success" : "error"
    );
  } catch {
    policyReads = repositories.map((repository) => ({ repository, error: "Policy state could not be read." }));
    renderPolicies();
    setMessage(policyStatus, "Policy state could not be read.", "error");
  } finally {
    policiesLoading = false;
    if (refreshPoliciesButton) refreshPoliciesButton.disabled = false;
  }
}

function reviewsEnabledFor(repositoryId: string): boolean {
  return organization.enabled && settings.enabled && settings.repositories[repositoryId]?.enabled === true;
}

function policyBadge(label: string, value: string, tone: "good" | "muted" | "warn" | "error"): HTMLElement {
  const badge = document.createElement("span");
  badge.className = `policy-badge ${tone}`;
  badge.textContent = `${label}: ${value}`;
  return badge;
}

function branchProtectionLabel(read: PolicyRead): { label: string; tone: "good" | "muted" | "warn" | "error" } {
  if (read.error) return { label: "Unknown", tone: "error" };
  const summary = read.summary;
  if (!summary || summary.total === 0) return { label: "None", tone: "muted" };
  if (summary.enabled === 0) return { label: "Configured but disabled", tone: "warn" };
  return { label: `${summary.enabled} enabled polic${summary.enabled === 1 ? "y" : "ies"}`, tone: "good" };
}

function mastheadGateLabel(read: PolicyRead): { label: string; tone: "good" | "muted" | "warn" | "error" } {
  if (read.error) return { label: "Unknown", tone: "error" };
  const gate = read.summary?.masthead;
  if (!gate) return { label: "Not configured", tone: "muted" };
  if (!gate.enabled) return { label: "Configured but disabled", tone: "warn" };
  if (gate.blocking) return { label: gate.conditional ? "Required (conditional)" : "Required", tone: "good" };
  return { label: "Optional", tone: "muted" };
}

function policyHelpSummary(read: PolicyRead): string {
  if (read.error) return "Policy details";
  return read.summary?.masthead ? "Manage or remove policy" : "Set up policy";
}

function appendPolicyHelp(container: HTMLElement, read: PolicyRead): void {
  const branch = defaultBranchName(read.repository.defaultBranch);
  const link = document.createElement("a");
  link.href = branchPolicyUrl(organizationUrl(hostName), projectName, read.repository.id, branch);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = branch ? `Open branch policies for ${branch}` : "Open repository branch policies";
  container.append(link);

  const gate = read.summary?.masthead;
  if (read.error) {
    const message = document.createElement("p");
    message.textContent = "Masthead could not read the branch policies for this repository. Open the branch policies page to check the Masthead status policy directly.";
    container.append(message);
    return;
  }
  if (!gate) {
    const message = document.createElement("p");
    message.textContent = "No masthead/review status policy applies to this default branch.";
    const steps = document.createElement("ol");
    for (const step of [
      "Open the branch policies page for this branch.",
      "Under Status checks, select +.",
      "Enter masthead/review as the status to check.",
      "Set Policy requirement to Required and choose Conditional or Apply by default.",
      "Save the policy."
    ]) {
      const item = document.createElement("li");
      item.textContent = step;
      steps.append(item);
    }
    container.append(message, steps);
  } else {
    const message = document.createElement("p");
    message.textContent = !gate.enabled
      ? "The Masthead status policy exists but is disabled; it does not block completion."
      : gate.blocking
        ? "A required Masthead status policy applies to this default branch."
        : "The Masthead status policy exists but is optional; it does not block completion.";
    const behavior = document.createElement("p");
    behavior.textContent = [
      gate.conditional ? "Applies after the first status is posted." : "Applies as soon as the pull request is created.",
      gate.resetOnSourceUpdate
        ? "Resets when the source branch changes."
        : "Does not reset when the source branch changes."
    ].join(" ");
    container.append(message, behavior);
    const action = document.createElement("p");
    action.textContent = !gate.enabled
      ? "Enable or remove the masthead/review status check on the branch policies page."
      : gate.blocking
        ? "To change or remove the requirement, edit or delete the masthead/review status check on the branch policies page."
        : "To require the status, edit the masthead/review status check on the branch policies page and set Required.";
    container.append(action);
  }

  if (!organization.pipelineId) {
    const warning = document.createElement("p");
    warning.className = "policy-warning";
    warning.textContent = "No central review pipeline is bound in organization settings, so pull requests may not receive this status.";
    container.append(warning);
  }
  if (gate?.enabled && gate.blocking && !reviewsEnabledFor(read.repository.id)) {
    const warning = document.createElement("p");
    warning.className = "policy-warning";
    warning.textContent = "Reviews are disabled for this repository. Masthead posts notApplicable, so this gate does not block completion.";
    container.append(warning);
  }
  if (gate?.enabled && gate.blocking && !gate.resetOnSourceUpdate) {
    const warning = document.createElement("p");
    warning.className = "policy-warning";
    warning.textContent = "A previous success can satisfy this policy after new commits. Enable reset on new changes in Azure DevOps if every push should be reviewed.";
    container.append(warning);
  }
}

function renderPolicyCard(read: PolicyRead): HTMLElement {
  const card = document.createElement("article");
  card.className = "policy-card";
  const head = document.createElement("div");
  head.className = "policy-card-head";
  const title = document.createElement("h3");
  title.textContent = read.repository.name;
  const branch = document.createElement("span");
  branch.className = "policy-branch";
  branch.textContent = read.repository.defaultBranch
    ? `Default branch: ${defaultBranchName(read.repository.defaultBranch)}`
    : "Default branch: unknown";
  head.append(title, branch);

  const protection = branchProtectionLabel(read);
  const gate = mastheadGateLabel(read);
  const badges = document.createElement("div");
  badges.className = "policy-badges";
  badges.append(
    policyBadge("Branch protection", protection.label, protection.tone),
    policyBadge("Masthead gate", gate.label, gate.tone)
  );

  const details = document.createElement("details");
  details.className = "policy-help";
  const summary = document.createElement("summary");
  summary.className = "policy-help-toggle";
  summary.textContent = policyHelpSummary(read);
  const body = document.createElement("div");
  body.className = "policy-help-body";
  appendPolicyHelp(body, read);
  details.append(summary, body);

  card.append(head, badges, details);
  return card;
}

function renderPolicies(): void {
  if (!policyList) return;
  policyList.replaceChildren();
  if (repositories.length === 0) {
    policyList.textContent = "No repositories were found in this project.";
    return;
  }
  if (policiesLoading && policyReads.length === 0) {
    policyList.textContent = "Loading policy state...";
    return;
  }
  if (policyReads.length === 0) {
    policyList.textContent = "Select Refresh policy state to read branch policies.";
    return;
  }
  for (const read of policyReads) policyList.append(renderPolicyCard(read));
}

/** The organization profile is the baseline for every project control. */
function organizationProfile() {
  return resolveReviewProfile(organization.profile ?? defaultReviewProfile());
}

/** Render project-level profile and one collapsible editor per repository. */
function renderReviewProfiles(): void {
  if (!inheritProfile) return;
  inheritProfile.checked = settings.inheritProfile;
  const orgProfile = organizationProfile();
  const projectProfile = settings.inheritProfile ? orgProfile : resolveReviewProfile(settings.profile ?? orgProfile);
  if (orgProfileSummary) {
    orgProfileSummary.textContent = settings.inheritProfile
      ? `Inheriting organization lenses: ${orgProfile.enabledLenses.join(", ")}.`
      : "Project override is active. The organization profile is not used for lenses.";
  }
  if (projectProvider) projectProvider.value = settings.provider ?? "";
  if (projectModel) projectModel.value = settings.model ?? "";
  fillModelOptions(projectModelOptions, settings.provider ?? organization.provider, modelCatalog);
  fillModelOptions(allModelOptions, undefined, modelCatalog);
  renderLensOptions(projectLensList, projectProfile.enabledLenses, settings.inheritProfile);
  if (projectReviewGuide) projectReviewGuide.checked = projectProfile.reviewGuide;
  setLensOptionsDisabled(projectLensList, settings.inheritProfile);
  if (projectReviewGuide) projectReviewGuide.disabled = settings.inheritProfile;
  renderRepositoryProfiles();
}

/** Give each repository an opt-in editor without hiding its eligibility switch. */
function renderRepositoryProfiles(): void {
  if (!repoProfileList) return;
  repoProfileList.replaceChildren();
  const projectProfile = settings.inheritProfile
    ? organizationProfile()
    : resolveReviewProfile(settings.profile ?? organizationProfile());
  for (const repository of repositories) {
    const stored = settings.repositories[repository.id] ?? { enabled: false };
    const details = document.createElement("details");
    details.className = "repo-profile";
    details.dataset.repositoryId = repository.id;
    details.dataset.repositoryName = repository.name;
    const summary = document.createElement("summary");
    const body = document.createElement("div");
    body.className = "repo-profile-body";

    const inherit = document.createElement("input");
    inherit.type = "checkbox";
    inherit.className = "repo-profile-inherit";
    inherit.checked = !stored.profile && !stored.provider && !stored.model;
    const inheritLabel = document.createElement("label");
    inheritLabel.className = "switch-row";
    const inheritCopy = document.createElement("span");
    const inheritTitle = document.createElement("strong");
    inheritTitle.textContent = "Use the project review profile";
    const inheritNote = document.createElement("small");
    inheritNote.textContent = "Clear this to override the provider, model, lenses or guide for this repository.";
    inheritCopy.append(inheritTitle, inheritNote);
    inheritLabel.append(inherit, inheritCopy);

    const fields = document.createElement("div");
    fields.className = "field-grid";
    const provider = document.createElement("select");
    provider.className = "repo-profile-provider";
    provider.innerHTML = [
      '<option value="">Inherit project or organization provider</option>',
      '<option value="anthropic">Anthropic</option>',
      '<option value="openai">OpenAI</option>',
      '<option value="deepseek">DeepSeek</option>'
    ].join("");
    provider.value = stored.provider ?? "";
    const providerLabel = document.createElement("label");
    providerLabel.className = "field";
    const providerTitle = document.createElement("span");
    providerTitle.textContent = "Provider override";
    providerLabel.append(providerTitle, provider);
    const model = document.createElement("input");
    model.type = "text";
    model.className = "repo-profile-model";
    model.maxLength = 200;
    model.autocomplete = "off";
    model.setAttribute("list", "all-model-options");
    model.placeholder = "Inherit project or organization model";
    model.value = stored.model ?? "";
    const modelLabel = document.createElement("label");
    modelLabel.className = "field";
    const modelTitle = document.createElement("span");
    modelTitle.textContent = "Model override";
    modelLabel.append(modelTitle, model);
    fields.append(providerLabel, modelLabel);

    const lensList = document.createElement("div");
    lensList.className = "lens-list repo-profile-lenses";
    const repositoryProfile = resolveReviewProfile(stored.profile ?? projectProfile);
    renderLensOptions(lensList, repositoryProfile.enabledLenses, inherit.checked);
    const guide = document.createElement("input");
    guide.type = "checkbox";
    guide.className = "repo-profile-guide";
    guide.checked = repositoryProfile.reviewGuide;
    guide.disabled = inherit.checked;
    const guideLabel = document.createElement("label");
    guideLabel.className = "switch-row";
    const guideCopy = document.createElement("span");
    const guideTitle = document.createElement("strong");
    guideTitle.textContent = "Publish a review guide for this repository";
    const guideNote = document.createElement("small");
    guideNote.textContent = "An override applies only when the repository switch is enabled.";
    guideCopy.append(guideTitle, guideNote);
    guideLabel.append(guide, guideCopy);

    const sync = (): void => {
      const disabled = inherit.checked;
      provider.disabled = disabled;
      model.disabled = disabled;
      guide.disabled = disabled;
      setLensOptionsDisabled(lensList, disabled);
      summary.textContent = `${repository.name} - ${disabled ? "inherits project profile" : "custom override"}`;
    };
    inherit.addEventListener("change", sync);
    sync();
    body.append(inheritLabel, fields, lensList, guideLabel);
    details.append(summary, body);
    repoProfileList.append(details);
  }
  if (repositories.length === 0) {
    repoProfileList.textContent = "No repositories were found in this project.";
  }
}

/** Toggle the project profile editor between inherited and local. */
function syncProfileControls(): void {
  const inherited = inheritProfile?.checked !== false;
  setLensOptionsDisabled(projectLensList, inherited);
  if (projectReviewGuide) projectReviewGuide.disabled = inherited;
  if (orgProfileSummary) {
    orgProfileSummary.textContent = inherited
      ? `Inheriting organization lenses: ${organizationProfile().enabledLenses.join(", ")}.`
      : "Project override is active. The organization profile is not used for lenses.";
  }
}

async function save(): Promise<void> {
  if (!projectEnabled || !repositoryList) return;
  const inherit = inheritProfile?.checked !== false;
  const next: ProjectSettings = {
    ...settings,
    enabled: projectEnabled.checked,
    defaultRepositoryEnabled: (newRepositoryDefault?.value as RepositoryDefault | undefined) ?? "inherit",
    inheritProfile: inherit,
    provider: projectProvider?.value || undefined,
    model: projectModel?.value.trim() || undefined,
    repositories: { ...settings.repositories }
  };
  if (inherit) {
    delete next.profile;
  } else {
    next.profile = resolveReviewProfile({
      enabledLenses: selectedLenses(projectLensList),
      reviewGuide: projectReviewGuide?.checked !== false
    });
  }
  for (const input of repositoryList.querySelectorAll<HTMLInputElement>("input[data-repository-id]")) {
    const repositoryId = input.dataset.repositoryId;
    if (!repositoryId) continue;
    next.repositories[repositoryId] = {
      ...(next.repositories[repositoryId] ?? { enabled: false }),
      enabled: input.checked
    };
  }
  for (const details of repoProfileList?.querySelectorAll<HTMLDetailsElement>("details[data-repository-id]") ?? []) {
    const repositoryId = details.dataset.repositoryId;
    if (!repositoryId) continue;
    const repository = next.repositories[repositoryId] ?? { enabled: false };
    const inheritRepository = details.querySelector<HTMLInputElement>(".repo-profile-inherit")?.checked !== false;
    if (inheritRepository) {
      const inherited = { ...repository };
      delete inherited.profile;
      delete inherited.provider;
      delete inherited.model;
      next.repositories[repositoryId] = inherited;
      continue;
    }
    next.repositories[repositoryId] = {
      ...repository,
      profile: resolveReviewProfile({
        enabledLenses: selectedLenses(details.querySelector<HTMLElement>(".repo-profile-lenses")),
        reviewGuide: details.querySelector<HTMLInputElement>(".repo-profile-guide")?.checked !== false
      }),
      provider: details.querySelector<HTMLSelectElement>(".repo-profile-provider")?.value || undefined,
      model: details.querySelector<HTMLInputElement>(".repo-profile-model")?.value.trim() || undefined
    };
  }
  if (saveButton) saveButton.disabled = true;
  setMessage(saveStatus, "Saving...");
  try {
    await saveSetting(`project.${projectId}`, next);
    settings = next;
    renderPolicies();
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

  renderLensExamples(projectExampleTabs, projectExamplePanel);
  activateTab(window.location.hash.replace(/^#/, ""));

  try {
    organization = normalizeOrganizationSettings(await loadSetting<OrganizationSettings>("organization", defaultOrganizationSettings()));
    if (orgState) orgState.textContent = organization.enabled ? "enabled" : "disabled";
    try {
      modelCatalog = normalizeModelCatalog(await loadSetting<ModelCatalog>("modelCatalog", {}));
    } catch {
      modelCatalog = {};
    }
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
    renderReviewProfiles();
    renderPolicies();
    void loadCompletionPolicies();
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
  projectEnabled?.addEventListener("change", () => {
    syncProjectState();
    renderPolicies();
  });
  refreshPoliciesButton?.addEventListener("click", () => {
    void loadCompletionPolicies();
  });
  inheritProfile?.addEventListener("change", syncProfileControls);
  projectProvider?.addEventListener("change", () => {
    fillModelOptions(projectModelOptions, projectProvider.value || organization.provider, modelCatalog);
  });
  for (const tab of tabs) {
    tab.addEventListener("click", () => activateTab(tab.dataset.tab ?? "general"));
  }
}

void main();

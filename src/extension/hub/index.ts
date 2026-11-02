// Organization configuration is application data. Provider keys and repository
// content are deliberately absent from this page and its storage.
import * as SDK from "azure-devops-extension-sdk";
import {
  defaultOrganizationSettings,
  normalizeOrganizationSettings,
  OrganizationSettings
} from "../../settings";
import { initializeHost, notifyHostFailed, notifyHostLoaded, organizationUrl } from "../shared/host";
import { loadSetting, saveSetting } from "../shared/storage";

const statusText = document.querySelector<HTMLElement>("#host-status");
const statusDot = document.querySelector<HTMLElement>("#status-dot");
const hostMeta = document.querySelector<HTMLElement>("#host-meta");
const form = document.querySelector<HTMLFormElement>("#settings-form");
const enabled = document.querySelector<HTMLInputElement>("#org-enabled");
const nativeRadio = document.querySelector<HTMLInputElement>("#delivery-native");
const brokerRadio = document.querySelector<HTMLInputElement>("#delivery-broker");
const nativeChoice = document.querySelector<HTMLElement>("#native-choice");
const brokerChoice = document.querySelector<HTMLElement>("#broker-choice");
const nativeWebhook = document.querySelector<HTMLInputElement>("#native-webhook");
const brokerUrl = document.querySelector<HTMLInputElement>("#broker-url");
const pipelineProject = document.querySelector<HTMLInputElement>("#pipeline-project");
const pipelineId = document.querySelector<HTMLInputElement>("#pipeline-id");
const saveStatus = document.querySelector<HTMLElement>("#save-status");
const pipelineStatus = document.querySelector<HTMLElement>("#pipeline-status");
const validateButton = document.querySelector<HTMLButtonElement>("#validate-pipeline");
const saveButton = document.querySelector<HTMLButtonElement>("#save-settings");

let hostName = "";
let settings = defaultOrganizationSettings();

/** Show a page-level failure without exposing host details. */
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

/** Make the selected delivery mode unmistakable, not just a native radio dot. */
function syncDeliveryChoice(): void {
  nativeChoice?.classList.toggle("selected", nativeRadio?.checked === true);
  brokerChoice?.classList.toggle("selected", brokerRadio?.checked === true);
}

/** Render stored settings without trusting malformed extension data. */
function render(value: OrganizationSettings): void {
  settings = value;
  if (enabled) enabled.checked = value.enabled;
  if (nativeRadio) nativeRadio.checked = value.deploymentMode === "native";
  if (brokerRadio) brokerRadio.checked = value.deploymentMode === "broker";
  syncDeliveryChoice();
  if (nativeWebhook) nativeWebhook.value = value.nativeWebhookName ?? "MastheadPR";
  if (brokerUrl) brokerUrl.value = value.brokerUrl ?? "";
  if (pipelineProject) pipelineProject.value = value.pipelineProject ?? "";
  if (pipelineId) pipelineId.value = value.pipelineId ? String(value.pipelineId) : "";
}

/** Validate only ordinary URLs; provider secrets never enter this form. */
function validBrokerUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch {
    return false;
  }
}

/** Persist the organization switches; empty pipeline fields remain optional. */
async function save(): Promise<void> {
  if (!enabled || !nativeRadio || !brokerRadio) return;
  const selectedMode = brokerRadio.checked ? "broker" : "native";
  const url = brokerUrl?.value.trim() ?? "";
  if (!validBrokerUrl(url)) {
    setMessage(saveStatus, "Broker URL must use HTTPS (or HTTP on loopback).", "error");
    return;
  }
  const parsedPipelineId = pipelineId?.value.trim() ? Number(pipelineId.value) : undefined;
  if (parsedPipelineId !== undefined && (!Number.isSafeInteger(parsedPipelineId) || parsedPipelineId < 1)) {
    setMessage(saveStatus, "Pipeline ID must be a positive integer.", "error");
    return;
  }
  const next: OrganizationSettings = {
    ...settings,
    enabled: enabled.checked,
    deploymentMode: selectedMode,
    nativeWebhookName: nativeWebhook?.value.trim() || "MastheadPR",
    brokerUrl: url || undefined,
    pipelineProject: pipelineProject?.value.trim() || undefined,
    pipelineId: parsedPipelineId,
    brokerVerified: false
  };
  if (saveButton) saveButton.disabled = true;
  setMessage(saveStatus, "Saving...");
  try {
    await saveSetting("organization", next);
    settings = next;
    setMessage(saveStatus, "Organization settings saved.", "success");
  } catch {
    setMessage(saveStatus, "Settings could not be saved. Reload and try again.", "error");
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

/** Validate that the configured central pipeline is readable by this identity. */
async function validatePipeline(): Promise<void> {
  const project = pipelineProject?.value.trim() ?? "";
  const id = Number(pipelineId?.value.trim() ?? "");
  if (!project || !Number.isSafeInteger(id) || id < 1) {
    setMessage(pipelineStatus, "Enter a pipeline project and positive pipeline ID.", "error");
    return;
  }
  if (validateButton) validateButton.disabled = true;
  setMessage(pipelineStatus, "Checking pipeline...");
  try {
    const token = await SDK.getAccessToken();
    const response = await fetch(
      `${organizationUrl(hostName)}/${encodeURIComponent(project)}/_apis/pipelines/${id}?api-version=7.1`,
      { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, redirect: "error" }
    );
    if (response.ok) {
      setMessage(pipelineStatus, "Pipeline found and readable by this identity.", "success");
    } else {
      setMessage(pipelineStatus, `Pipeline was not accessible (HTTP ${response.status}).`, "error");
    }
  } catch {
    setMessage(pipelineStatus, "Pipeline validation could not be completed.", "error");
  } finally {
    if (validateButton) validateButton.disabled = false;
  }
}

async function main(): Promise<void> {
  try {
    const context = await initializeHost();
    hostName = context.host.name;
    if (statusDot) statusDot.className = "status-dot ready";
    if (statusText) statusText.textContent = "Connected to Azure DevOps.";
    if (hostMeta) hostMeta.textContent = `${hostName} - Masthead ${context.extension.version}`;
    await notifyHostLoaded();
  } catch {
    showHostFailure();
    await notifyHostFailed("Masthead could not initialize the Azure DevOps host.");
    return;
  }

  try {
    render(normalizeOrganizationSettings(await loadSetting<OrganizationSettings>("organization", defaultOrganizationSettings())));
  } catch {
    setMessage(saveStatus, "Organization settings could not be loaded. The host connection is still working.", "error");
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void save();
  });
  validateButton?.addEventListener("click", () => {
    void validatePipeline();
  });
  nativeRadio?.addEventListener("change", syncDeliveryChoice);
  brokerRadio?.addEventListener("change", syncDeliveryChoice);
}

void main();

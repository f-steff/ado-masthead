// Read the organization and project settings that gate one review. The settings
// pages store ordinary extension data, never provider credentials. A pipeline
// can use the extension-data API or provide the same JSON through a variable for
// local tests and controlled deployments.
import {
  defaultOrganizationSettings,
  defaultProjectSettings,
  isReviewEnabled,
  normalizeOrganizationSettings,
  normalizeProjectSettings,
  OrganizationSettings,
  ProjectSettings
} from "../settings";

export interface SettingsSourceOptions {
  organizationUrl: string;
  token: string;
  tokenScheme: "basic" | "bearer";
  publisher: string;
  extensionId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ReviewSettingsSnapshot {
  organization: OrganizationSettings;
  project: ProjectSettings;
  projectId: string;
  repositoryId: string;
  source: "extension-data" | "snapshot";
}

export class SettingsAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsAccessError";
  }
}

/** Return a setting document value, or undefined when it was never created. */
export async function readExtensionSetting(
  options: SettingsSourceOptions,
  key: string
): Promise<unknown | undefined> {
  if (!key.trim()) throw new Error("A settings key is required.");
  if (!options.token.trim()) throw new Error("An Azure DevOps token is required to read settings.");
  const publisher = requiredSegment(options.publisher, "publisher");
  const extensionId = requiredSegment(options.extensionId, "extension id");
  const documentId = requiredSegment(key, "settings key");
  const base = extensionManagementUrl(options.organizationUrl);
  const url = `${base}/_apis/ExtensionManagement/InstalledExtensions/${encodeURIComponent(publisher)}/` +
    `${encodeURIComponent(extensionId)}/Data/Scopes/Default/Current/Collections/%24settings/Documents/` +
    `${encodeURIComponent(documentId)}?api-version=6.0-preview.1`;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method: "GET",
      headers: {
        authorization: options.tokenScheme === "bearer"
          ? `Bearer ${options.token}`
          : `Basic ${Buffer.from(`:${options.token}`, "utf8").toString("base64")}`,
        accept: "application/json"
      },
      signal: timeout,
      redirect: "error"
    });
  } catch {
    throw new SettingsAccessError("Masthead settings could not be requested.");
  }
  if (response.status === 404) {
    return undefined;
  }
  if (response.status === 401 || response.status === 403) {
    throw new SettingsAccessError(
      "Masthead settings are not readable by this pipeline identity. " +
      "Check that MASTHEAD_EXTENSION_ID names the installed extension and that the pipeline identity can read extension data."
    );
  }
  if (!response.ok) {
    throw new SettingsAccessError(`Masthead settings request failed with HTTP ${response.status}.`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SettingsAccessError("Masthead settings returned invalid JSON.");
  }
  if (!isRecord(payload)) {
    throw new SettingsAccessError("Masthead settings returned an invalid document.");
  }
  return "value" in payload ? payload.value : undefined;
}

/**
 * Resolve the organization and project gates for one destination repository.
 * Project and repository discovery are live: a repository with no explicit
 * document is disabled rather than silently enabled by a stale default.
 */
export async function loadReviewSettings(
  options: SettingsSourceOptions & {
    projectId: string;
    repositoryId: string;
    snapshot?: string;
  }
): Promise<ReviewSettingsSnapshot> {
  const projectId = requiredSegment(options.projectId, "project id");
  const repositoryId = requiredSegment(options.repositoryId, "repository id");
  const raw = options.snapshot?.trim()
    ? parseSnapshot(options.snapshot)
    : {
        organization: await readExtensionSetting(options, "organization"),
        project: await readExtensionSetting(options, `project.${projectId}`)
      };
  const organization = normalizeOrganizationSettings(raw.organization ?? defaultOrganizationSettings());
  const project = normalizeProjectSettings(raw.project ?? {
    ...defaultProjectSettings(),
    enabled: organization.defaultProjectEnabled
  });
  return {
    organization,
    project,
    projectId,
    repositoryId,
    source: options.snapshot?.trim() ? "snapshot" : "extension-data"
  };
}

/** Parse the same shape the settings UI writes, with explicit defaults. */
export function parseSnapshot(value: string): { organization?: unknown; project?: unknown } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new SettingsAccessError("MASTHEAD_SETTINGS_JSON is not valid JSON.");
  }
  if (!isRecord(parsed)) {
    throw new SettingsAccessError("MASTHEAD_SETTINGS_JSON must be an object.");
  }
  return {
    ...(parsed.organization === undefined ? {} : { organization: parsed.organization }),
    ...(parsed.project === undefined ? {} : { project: parsed.project })
  };
}

/** Fail before a provider call when any persisted gate is off. */
export function reviewGate(snapshot: ReviewSettingsSnapshot): boolean {
  return isReviewEnabled(snapshot.organization, snapshot.project, snapshot.repositoryId);
}

function requiredSegment(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 300 || /[\r\n]/.test(trimmed)) {
    throw new Error(`Set ${name}.`);
  }
  return trimmed;
}

/**
 * Extension data is served by the extension-management host. Derive it from the
 * organization URL so an event or pull request cannot redirect a token.
 */
function extensionManagementUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("AZURE_DEVOPS_ORG_URL is invalid.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
    throw new Error("The Azure DevOps organization URL must use HTTPS or loopback HTTP.");
  }
  if (url.hostname === "dev.azure.com") {
    const organization = url.pathname.split("/").filter(Boolean)[0];
    if (!organization) throw new Error("AZURE_DEVOPS_ORG_URL must include an organization.");
    return `https://extmgmt.dev.azure.com/${encodeURIComponent(organization)}`;
  }
  const visualStudio = /^([^.]+)\.visualstudio\.com$/i.exec(url.hostname);
  if (visualStudio?.[1]) {
    return `https://extmgmt.dev.azure.com/${encodeURIComponent(visualStudio[1])}`;
  }
  // On-premises Azure DevOps Server serves the management API on its own host.
  return url.href.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

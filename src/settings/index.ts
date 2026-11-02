// Persisted configuration for the organization and its projects. Repository
// IDs are kept as opaque strings because they are stable across renames.
import { defaultReviewProfile, ReviewProfile, ReviewLensId, resolveReviewProfile } from "../review/lenses";

export type DeploymentMode = "native" | "broker";

export type RepositoryDefault = "inherit" | "enabled" | "disabled";

export interface OrganizationSettings {
  /** Organization master switch; no project can spend tokens while this is off. */
  enabled: boolean;
  /** Default eligibility for projects first discovered after installation. */
  defaultProjectEnabled: boolean;
  /** Default eligibility for repositories when a project inherits. */
  defaultRepositoryEnabled: boolean;
  deploymentMode: DeploymentMode;
  /** Public URL of the optional Dockerised broker. Never contains a secret. */
  brokerUrl?: string;
  /** The ADO incoming webhook name used by native mode. */
  nativeWebhookName?: string;
  /** True only after a broker health check has succeeded. */
  brokerVerified: boolean;
  /** Project that owns the central review pipeline. */
  pipelineProject?: string;
  /** Optional central pipeline validation target. */
  pipelineId?: number;
  /** Human-readable name captured with the pipeline binding. */
  pipelineName?: string;
  /** Organization-wide review profile used when a project inherits. */
  profile?: Partial<ReviewProfile>;
  /** Optional provider override; the key still comes from a pipeline secret. */
  provider?: string;
  /** Optional model override for the selected provider. */
  model?: string;
  /** Optional OpenAI reasoning effort for compatible models. */
  reasoningEffort?: "low" | "medium" | "high";
  /** Optional Anthropic extended-thinking budget. */
  thinkingBudget?: number;
}

export type RepositorySettings = {
  enabled: boolean;
  profile?: Partial<ReviewProfile>;
  provider?: string;
  model?: string;
};

export interface ProjectSettings {
  enabled: boolean;
  /** Default for repositories first discovered in this project. */
  defaultRepositoryEnabled: RepositoryDefault;
  /** False means this project uses the organization review profile. */
  inheritProfile: boolean;
  profile?: Partial<ReviewProfile>;
  provider?: string;
  model?: string;
  repositories: Record<string, RepositorySettings>;
}

/** A resolved profile and optional provider/model override for one review. */
export interface ReviewSelection {
  profile: ReviewProfile;
  provider?: string;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  thinkingBudget?: number;
}

/** Do not assume a broker or service connection was verified during installation. */
export function defaultOrganizationSettings(): OrganizationSettings {
  return {
    enabled: true,
    defaultProjectEnabled: true,
    defaultRepositoryEnabled: false,
    deploymentMode: "native",
    nativeWebhookName: "MastheadPR",
    brokerVerified: false,
    profile: defaultReviewProfile()
  };
}

/** A project is eligible, but no repository spends tokens until explicitly enabled. */
export function defaultProjectSettings(): ProjectSettings {
  return {
    enabled: true,
    defaultRepositoryEnabled: "inherit",
    inheritProfile: true,
    repositories: {}
  };
}

/**
 * A project can be disabled independently of its repositories. A repository
 * is eligible only when both levels are explicitly enabled.
 */
export function isRepositoryEnabled(
  project: ProjectSettings,
  repositoryId: string
): boolean {
  if (!project.enabled) {
    return false;
  }
  return project.repositories[repositoryId]?.enabled === true;
}

/**
 * The organization master switch overrides everything. A repository with no
 * stored switch follows the project/organization default instead of being
 * silently enabled; explicit repository choices always win.
 */
export function isReviewEnabled(
  organization: OrganizationSettings,
  project: ProjectSettings,
  repositoryId: string
): boolean {
  if (!organization.enabled || !project.enabled) return false;
  const repository = project.repositories[repositoryId];
  return repository
    ? repository.enabled === true
    : newRepositoryEnabled(organization, project);
}

/** Resolve a project's new-repository policy against the organization default. */
export function newRepositoryEnabled(
  organization: OrganizationSettings,
  project: ProjectSettings
): boolean {
  if (project.defaultRepositoryEnabled === "enabled") return true;
  if (project.defaultRepositoryEnabled === "disabled") return false;
  return organization.defaultRepositoryEnabled;
}

/** Seed new repositories from the project policy without re-enabling old ones. */
export function seedProjectRepositories(
  organization: OrganizationSettings,
  project: ProjectSettings,
  repositoryIds: readonly string[]
): ProjectSettings {
  return seedRepositories(project, repositoryIds, newRepositoryEnabled(organization, project));
}

/**
 * Discovery must never opt a new repository into paid analysis. An explicit
 * administrator action may pass true when bulk-enabling selected repositories.
 */
export function seedRepositories(
  project: ProjectSettings,
  repositoryIds: readonly string[],
  enabledByDefault = false
): ProjectSettings {
  const repositories = { ...project.repositories };
  for (const repositoryId of repositoryIds) {
    if (!repositories[repositoryId]) {
      repositories[repositoryId] = { enabled: enabledByDefault };
    }
  }
  return { ...project, repositories };
}

/**
 * Builds the profile for a selected repository. The review profile is stored
 * separately from repository eligibility so a project can reuse settings.
 */
export function profileForRepository(
  project: ProjectSettings,
  repositoryId: string,
  fallback?: Partial<ReviewProfile>
): Partial<ReviewProfile> | undefined {
  const repository = project.repositories[repositoryId];
  if (!repository || !isRepositoryEnabled(project, repositoryId)) {
    return undefined;
  }
  return repository.profile ?? fallback;
}

/**
 * Resolve the effective profile and optional provider/model override. A
 * repository override wins over a project override, which wins over the
 * organization default. The provider key never appears in this object.
 */
export function reviewSelection(
  organization: OrganizationSettings,
  project: ProjectSettings,
  repositoryId: string
): ReviewSelection {
  const organizationProfile = resolveReviewProfile(organization.profile);
  const projectProfile = project.inheritProfile
    ? organizationProfile
    : resolveReviewProfile(project.profile ?? organizationProfile);
  const repository = project.repositories[repositoryId];
  const profile = repository?.profile
    ? resolveReviewProfile(repository.profile)
    : projectProfile;
  return {
    profile,
    ...(repository?.provider ?? project.provider ?? organization.provider
      ? { provider: repository?.provider ?? project.provider ?? organization.provider }
      : {}),
    ...(repository?.model ?? project.model ?? organization.model
      ? { model: repository?.model ?? project.model ?? organization.model }
      : {}),
    ...(organization.reasoningEffort ? { reasoningEffort: organization.reasoningEffort } : {}),
    ...(organization.thinkingBudget ? { thinkingBudget: organization.thinkingBudget } : {})
  };
}

/** Editing a profile changes review behavior, never the repository's eligibility. */
export function setRepositoryProfile(
  project: ProjectSettings,
  repositoryId: string,
  enabledLenses: ReviewLensId[],
  reviewGuide = true
): ProjectSettings {
  return {
    ...project,
    repositories: {
      ...project.repositories,
      [repositoryId]: {
        ...(project.repositories[repositoryId] ?? { enabled: false }),
        profile: resolveReviewProfile({ enabledLenses, reviewGuide })
      }
    }
  };
}

/** Treat extension data as untrusted configuration and fill only known fields. */
export function normalizeOrganizationSettings(value: unknown): OrganizationSettings {
  const defaults = defaultOrganizationSettings();
  if (!isRecord(value)) return defaults;
  const mode = value.deploymentMode === "broker" ? "broker" : "native";
  const pipelineId = positiveInteger(value.pipelineId);
  return {
    enabled: value.enabled !== false,
    defaultProjectEnabled: value.defaultProjectEnabled !== false,
    defaultRepositoryEnabled: value.defaultRepositoryEnabled === true,
    deploymentMode: mode,
    brokerUrl: optionalString(value.brokerUrl),
    nativeWebhookName: optionalString(value.nativeWebhookName) ?? defaults.nativeWebhookName,
    brokerVerified: value.brokerVerified === true,
    ...(optionalString(value.pipelineProject) ? { pipelineProject: optionalString(value.pipelineProject) } : {}),
    ...(pipelineId === undefined ? {} : { pipelineId }),
    ...(optionalString(value.pipelineName) ? { pipelineName: optionalString(value.pipelineName) } : {}),
    ...(validProfile(value.profile) ? { profile: value.profile } : {}),
    ...(optionalString(value.provider) ? { provider: optionalString(value.provider) } : {}),
    ...(optionalString(value.model) ? { model: optionalString(value.model) } : {}),
    ...(reasoningEffort(value.reasoningEffort) ? { reasoningEffort: reasoningEffort(value.reasoningEffort) } : {}),
    ...(thinkingBudget(value.thinkingBudget) ? { thinkingBudget: thinkingBudget(value.thinkingBudget) } : {})
  };
}

/** Keep malformed persisted project data from enabling paid analysis. */
export function normalizeProjectSettings(value: unknown): ProjectSettings {
  const defaults = defaultProjectSettings();
  if (!isRecord(value) || !isRecord(value.repositories)) {
    return defaults;
  }
  const repositories: ProjectSettings["repositories"] = {};
  for (const [repositoryId, raw] of Object.entries(value.repositories)) {
    if (!repositoryId || !isRecord(raw)) continue;
    repositories[repositoryId] = {
      enabled: raw.enabled === true,
      ...(validProfile(raw.profile) ? { profile: raw.profile } : {}),
      ...(optionalString(raw.provider) ? { provider: optionalString(raw.provider) } : {}),
      ...(optionalString(raw.model) ? { model: optionalString(raw.model) } : {})
    };
  }
  return {
    enabled: value.enabled !== false,
    defaultRepositoryEnabled: repositoryDefault(value.defaultRepositoryEnabled),
    inheritProfile: value.inheritProfile !== false,
    ...(validProfile(value.profile) ? { profile: value.profile } : {}),
    ...(optionalString(value.provider) ? { provider: optionalString(value.provider) } : {}),
    ...(optionalString(value.model) ? { model: optionalString(value.model) } : {}),
    repositories
  };
}

/** Only a profile that resolves cleanly may enter the effective policy. */
function validProfile(value: unknown): value is Partial<ReviewProfile> {
  if (!isRecord(value)) return false;
  try {
    resolveReviewProfile(value as Partial<ReviewProfile>);
    return true;
  } catch {
    return false;
  }
}

function repositoryDefault(value: unknown): RepositoryDefault {
  return value === "enabled" || value === "disabled" ? value : "inherit";
}

/** Avoid arrays, null and non-integer configuration values. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function reasoningEffort(value: unknown): "low" | "medium" | "high" | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function thinkingBudget(value: unknown): number | undefined {
  const parsed = positiveInteger(value);
  return parsed && parsed <= 100_000 ? parsed : undefined;
}

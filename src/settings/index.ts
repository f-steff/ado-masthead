// Persisted configuration for the organization and its projects. Repository
// IDs are kept as opaque strings because they are stable across renames.
import { ReviewProfile, ReviewLensId, resolveReviewProfile } from "../review/lenses";

export type DeploymentMode = "native" | "broker";

export interface OrganizationSettings {
  deploymentMode: DeploymentMode;
  /** Public URL of the optional Dockerised broker. Never contains a secret. */
  brokerUrl?: string;
  /** The ADO incoming webhook name used by native mode. */
  nativeWebhookName?: string;
  /** True only after a broker health check has succeeded. */
  brokerVerified: boolean;
}

export type RepositorySettings = {
  enabled: boolean;
  profile?: Partial<ReviewProfile>;
};

export interface ProjectSettings {
  enabled: boolean;
  repositories: Record<string, RepositorySettings>;
}

/** Do not assume a broker or service connection was verified during installation. */
export function defaultOrganizationSettings(): OrganizationSettings {
  return {
    deploymentMode: "native",
    nativeWebhookName: "MastheadPR",
    brokerVerified: false
  };
}

/** A project is eligible, but no repository spends tokens until explicitly enabled. */
export function defaultProjectSettings(): ProjectSettings {
  return { enabled: true, repositories: {} };
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

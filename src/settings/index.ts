// Persisted configuration for the organization and its projects. Repository
// IDs are kept as opaque strings because they are stable across renames.
import { ReviewProfile, ReviewLensId } from "../review";

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

export function defaultOrganizationSettings(): OrganizationSettings {
  return {
    deploymentMode: "native",
    nativeWebhookName: "MastheadPR",
    brokerVerified: false
  };
}

export function defaultProjectSettings(): ProjectSettings {
  return { enabled: true, repositories: {} };
}

/**
 * A project can be disabled independently of its repositories. A repository
 * is eligible only when both levels are enabled and the repository has not
 * explicitly been disabled.
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
 * Applies a project-level default to repositories that have not been visited
 * yet. Existing explicit choices always win, so a sync of new repositories
 * cannot silently re-enable one that an administrator disabled.
 */
export function seedRepositories(
  project: ProjectSettings,
  repositoryIds: readonly string[],
  enabledByDefault = true
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
        ...(project.repositories[repositoryId] ?? { enabled: true }),
        profile: { enabledLenses, reviewGuide }
      }
    }
  };
}

// Pure helpers for the read-only completion-policy panel. Azure DevOps has no
// single "protected branch" flag, so the panel resolves the policies that apply
// to a repository's default branch and looks for the Masthead status policy.
export interface MastheadPolicyState {
  enabled: boolean;
  blocking: boolean;
  conditional: boolean;
  resetOnSourceUpdate: boolean;
  displayName?: string;
  id?: number;
}

export interface BranchPolicySummary {
  total: number;
  enabled: number;
  masthead?: MastheadPolicyState;
}

/** Resolve the branch name shown to administrators from an ADO ref name. */
export function defaultBranchName(refName: string | undefined): string {
  if (!refName || !refName.startsWith("refs/heads/")) return "";
  return refName.slice("refs/heads/".length);
}

/**
 * Read policy state without trusting arbitrary server values. The list endpoint
 * can return project-wide policies, so every scope is matched locally.
 */
export function summarizeBranchPolicies(
  values: readonly unknown[],
  repositoryId: string,
  refName: string
): BranchPolicySummary {
  let total = 0;
  let enabled = 0;
  let masthead: MastheadPolicyState | undefined;
  for (const value of values) {
    if (!isRecord(value) || value.isDeleted === true || !policyAppliesTo(value, repositoryId, refName)) {
      continue;
    }
    total += 1;
    if (value.isEnabled === true) enabled += 1;
    if (!isRecord(value.settings)) continue;
    const settings = value.settings;
    if (settings.statusGenre !== "masthead" || settings.statusName !== "review") continue;
    const candidate: MastheadPolicyState = {
      enabled: value.isEnabled === true,
      blocking: value.isBlocking === true,
      conditional: settings.policyApplicability === 1 ||
        (typeof settings.policyApplicability === "string" &&
          settings.policyApplicability.toLowerCase().includes("conditional")),
      resetOnSourceUpdate: settings.invalidateOnSourceUpdate === true,
      ...(typeof settings.defaultDisplayName === "string" && settings.defaultDisplayName.trim()
        ? { displayName: settings.defaultDisplayName.trim() }
        : {}),
      ...(typeof value.id === "number" && Number.isSafeInteger(value.id) ? { id: value.id } : {})
    };
    // Prefer an enabled policy, then a blocking one, for duplicate definitions.
    if (!masthead ||
        (candidate.enabled && !masthead.enabled) ||
        (candidate.enabled === masthead.enabled && candidate.blocking && !masthead.blocking)) {
      masthead = candidate;
    }
  }
  return { total, enabled, ...(masthead ? { masthead } : {}) };
}

/** List policies that apply to one branch, including project-level policies. */
export function policyConfigurationsUrl(
  organizationUrl: string,
  projectName: string,
  repositoryId: string,
  refName: string
): string {
  return `${organizationUrl.replace(/\/+$/, "")}/${encodeURIComponent(projectName)}/` +
    `_apis/policy/configurations?repositoryId=${encodeURIComponent(repositoryId)}` +
    `&refName=${encodeURIComponent(refName)}&api-version=7.1`;
}

/** Deep link to the repository branch-policy page for the default branch. */
export function branchPolicyUrl(
  organizationUrl: string,
  projectName: string,
  repositoryId: string,
  defaultBranch: string
): string {
  const base = `${organizationUrl.replace(/\/+$/, "")}/${encodeURIComponent(projectName)}/` +
    `_settings/repositories?repo=${encodeURIComponent(repositoryId)}&_a=policiesMid`;
  return defaultBranch ? `${base}&refs=${encodeURIComponent(`refs/heads/${defaultBranch}`)}` : base;
}

/** Match one policy's scope entries against the requested repository branch. */
export function policyAppliesTo(
  value: Record<string, unknown>,
  repositoryId: string,
  refName: string
): boolean {
  if (!isRecord(value.settings) || !Array.isArray(value.settings.scope)) return false;
  return value.settings.scope.some((entry) => {
    if (!isRecord(entry)) return false;
    if (typeof entry.repositoryId === "string" && entry.repositoryId && entry.repositoryId !== repositoryId) {
      return false;
    }
    if (entry.repositoryId !== undefined && entry.repositoryId !== null && typeof entry.repositoryId !== "string") {
      return false;
    }
    const matchKind = typeof entry.matchKind === "string" ? entry.matchKind.toLowerCase() : "exact";
    if (matchKind === "defaultbranch") return true;
    if (typeof entry.refName !== "string" || !entry.refName) return false;
    return matchKind === "prefix"
      ? refName.startsWith(entry.refName)
      : entry.refName.toLowerCase() === refName.toLowerCase();
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

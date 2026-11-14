// Pure helpers for the completion-policy panel. Azure DevOps has no single
// "protected branch" flag, so the panel resolves the policies that apply to a
// repository's default branch, looks for the Masthead status policy and builds
// the create/update request for that one policy.
export interface MastheadPolicyState {
  enabled: boolean;
  blocking: boolean;
  conditional: boolean;
  resetOnSourceUpdate: boolean;
  displayName?: string;
  id?: number;
  revision?: number;
}

/** The stable ADO policy type for a pull request status check. */
export const MASTHEAD_STATUS_POLICY_TYPE = "cbdc66da-9728-4af8-aada-9a5a32e4a226";

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
      ...(typeof value.id === "number" && Number.isSafeInteger(value.id) ? { id: value.id } : {}),
      ...(typeof value.revision === "number" && Number.isSafeInteger(value.revision)
        ? { revision: value.revision }
        : {})
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

/**
 * Create a required, conditional Masthead status policy for one default branch.
 * The policy resets on new commits and can be edited in ADO afterwards.
 */
export function mastheadPolicyRequestBody(
  repositoryId: string,
  refName: string
): Record<string, unknown> {
  if (!repositoryId.trim() || !/^refs\/heads\/[^\s]+$/.test(refName)) {
    throw new Error("A repository and branch ref are required.");
  }
  return {
    isEnabled: true,
    isBlocking: true,
    isDeleted: false,
    type: { id: MASTHEAD_STATUS_POLICY_TYPE },
    settings: {
      statusGenre: "masthead",
      statusName: "review",
      invalidateOnSourceUpdate: true,
      // 1 is the Conditional applicability value returned by ADO.
      policyApplicability: 1,
      defaultDisplayName: "Masthead review",
      scope: [{ repositoryId, refName, matchKind: "Exact" }]
    }
  };
}

/** Target the policy collection, or one policy configuration by ID. */
export function policyManagementUrl(
  organizationUrl: string,
  projectName: string,
  policyId?: number
): string {
  const base = `${organizationUrl.replace(/\/+$/, "")}/${encodeURIComponent(projectName)}/` +
    `_apis/policy/configurations`;
  return policyId === undefined
    ? `${base}?api-version=7.1`
    : `${base}/${policyId}?api-version=7.1`;
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

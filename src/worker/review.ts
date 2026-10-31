// A locally executable review boundary. Repository retrieval and ADO publication
// are separate adapters; this function never executes source or writes to ADO.
import { ProviderRequest, ProviderResponse } from "../providers";
import { ReviewProfile, resolveReviewProfile } from "../review/lenses";
import { buildReviewPrompt } from "../review/prompt";
import { applyRepositoryLicenseWarning, parseReviewResult, repositoryPath } from "../review/result";
import { ReviewInput, ReviewResult } from "../review/types";

export type ReviewModel = (request: ProviderRequest, signal?: AbortSignal) => Promise<ProviderResponse>;

export interface ReviewRun {
  result: ReviewResult;
  suppressedCount: number;
  model: string;
  rawUsage?: unknown;
}

export interface ReviewLimits {
  signal?: AbortSignal;
  maxInputCharacters?: number;
  maxMinorFindings?: number;
}

/** Bound input and validate all output before any publisher receives findings. */
export async function runReview(
  input: ReviewInput,
  requestedProfile: Partial<ReviewProfile> | undefined,
  model: ReviewModel,
  limits: ReviewLimits = {}
): Promise<ReviewRun> {
  const profile = resolveReviewProfile(requestedProfile);
  const minorLimit = limits.maxMinorFindings ?? 5;
  const inputLimit = limits.maxInputCharacters ?? 400_000;
  if (!Number.isSafeInteger(minorLimit) || minorLimit < 0 || !Number.isSafeInteger(inputLimit) || inputLimit < 1) {
    throw new Error("Invalid review limits.");
  }
  if (profile.enabledLenses.includes("license") && (!input.repositoryLicense || typeof input.repositoryLicense.missing !== "boolean")) {
    throw new Error("License review requires an explicit repository LICENSE lookup result.");
  }
  limits.signal?.throwIfAborted();
  const files = [...input.changedFiles, ...(input.relatedFiles ?? [])].map((file) => repositoryPath(file.path));
  if (profile.enabledLenses.includes("license") && input.repositoryLicense) {
    // LICENSE is repository-level evidence, even when absent. The worker owns its canonical warning.
    files.push(repositoryPath(input.repositoryLicense.path ?? "LICENSE"));
  }
  const prompt = buildReviewPrompt(input, profile);
  if (prompt.system.length + prompt.user.length > inputLimit) {
    throw new Error("Review input exceeds its budget; retrieve a smaller context explicitly.");
  }
  const response = await model(prompt, limits.signal);
  limits.signal?.throwIfAborted();
  const parsed = parseReviewResult(response.text, {
    enabledLenses: profile.enabledLenses,
    allowedFiles: files,
    requireGuide: profile.reviewGuide
  });

  // Suppression affects publication only. It never constitutes evidence that a prior finding is fixed.
  let minorCount = 0;
  const findings = parsed.findings.filter((finding) => {
    if (finding.confidence === "low" || (finding.severity === "minor" && finding.confidence !== "high")) {
      return false;
    }
    if (finding.severity === "minor") {
      minorCount += 1;
      return minorCount <= minorLimit;
    }
    return true;
  });
  const filtered: ReviewResult = { ...parsed, findings };
  const result = input.repositoryLicense
    ? applyRepositoryLicenseWarning(filtered, input.repositoryLicense, profile.enabledLenses.includes("license"))
    : filtered;
  return {
    result,
    suppressedCount: parsed.findings.length - findings.length,
    model: response.model,
    rawUsage: response.rawUsage
  };
}

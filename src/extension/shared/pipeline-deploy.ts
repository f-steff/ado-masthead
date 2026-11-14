// Pure request builders for deploying the bundled pipeline YAML into a trusted
// repository. The content always comes from the extension bundle, never from a
// pull request or another user-controlled source.
export type PipelineTemplate = "review" | "review-native";

export function pipelineTemplateFile(template: PipelineTemplate): string {
  return template === "review-native" ? "review-native.yml" : "review.yml";
}

/** ADO repository paths are absolute and must not escape the repository. */
export function validatePipelinePath(value: string): string {
  const path = value.trim();
  if (!path.startsWith("/") || path.includes("..") || path.includes("//") ||
      path.includes("\\") || path.includes("?") || path.includes("#") || path.length > 300) {
    throw new Error("Pipeline YAML path must be an absolute repository path such as /masthead/review.yml.");
  }
  return path;
}

export interface PipelinePushInput {
  branchRef: string;
  oldObjectId: string;
  path: string;
  content: string;
  exists: boolean;
}

/** Build the Git push that creates or updates one trusted template file. */
export function pipelinePushRequest(input: PipelinePushInput): Record<string, unknown> {
  if (!/^refs\/heads\/[^\s]+$/.test(input.branchRef)) {
    throw new Error("A branch ref is required.");
  }
  if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(input.oldObjectId)) {
    throw new Error("A branch commit id is required.");
  }
  const path = validatePipelinePath(input.path);
  if (!input.content.trim()) {
    throw new Error("The pipeline template is empty.");
  }
  return {
    refUpdates: [{ name: input.branchRef, oldObjectId: input.oldObjectId }],
    commits: [{
      comment: "Update Masthead review pipeline YAML",
      changes: [{
        changeType: input.exists ? "edit" : "add",
        item: { path },
        newContent: { content: input.content, contentType: "rawtext" }
      }]
    }]
  };
}

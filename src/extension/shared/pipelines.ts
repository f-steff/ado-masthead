// Pure pipeline-picker helpers. They are shared by the browser UI and tests so
// substring matching stays deterministic and does not depend on DOM state.
export interface PipelineOption {
  project: string;
  id: number;
  name: string;
}

export function pipelineLabel(pipeline: PipelineOption): string {
  return `${pipeline.project} / ${pipeline.name} (#${pipeline.id})`;
}

/** Filter by a case-insensitive substring over project, name and numeric ID. */
export function filterPipelines(
  pipelines: readonly PipelineOption[],
  query: string,
  limit = 100
): PipelineOption[] {
  const needle = query.trim().toLowerCase();
  return pipelines
    .filter((pipeline) => !needle || pipelineLabel(pipeline).toLowerCase().includes(needle))
    .slice(0, limit);
}

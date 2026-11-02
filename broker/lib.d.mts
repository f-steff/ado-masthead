// The protocol normalizer is shared with the Docker image without a TypeScript build in the image.
export interface NormalizedPrEvent {
  eventType: string;
  deliveryKey: string;
  projectId: string;
  repositoryId: string;
  pullRequestId: number;
  sourceCommit: string;
  targetCommit: string;
  status: string;
  comment?: { id: number; threadId: number; authorId: string; revision: string };
}
export function normalizeEvent(payload: unknown): NormalizedPrEvent;
export function parseEvent(body: string, maxBytes?: number): NormalizedPrEvent;
export function isAuthorized(headers: Record<string, unknown>, secret: string): boolean;
export function buildQueueBody(event: NormalizedPrEvent, pipelineId: string | number): {
  definition: { id: number };
  templateParameters: Record<string, string>;
};
export function queueUrl(org: string, project: string, apiVersion?: string): string;
export const SUPPORTED_EVENTS: Set<string>;

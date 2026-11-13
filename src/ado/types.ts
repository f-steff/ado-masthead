// Narrow ADO thread types used by the publisher. These are intentionally
// structural: tests can supply fixtures without importing the full REST client.
export type AdoThreadStatus = "unknown" | "active" | "fixed" | "wontFix" | "closed" | "byDesign" | "pending";

export interface AdoIdentity {
  id: string;
  displayName?: string;
}

export interface AdoComment {
  id: number;
  parentCommentId?: number;
  author?: AdoIdentity;
  content?: string;
  publishedDate?: string;
  lastUpdatedDate?: string;
}

export interface AdoLinePosition {
  line: number;
  offset: number;
}

export interface AdoThreadContext {
  filePath?: string;
  rightFileStart?: AdoLinePosition;
  rightFileEnd?: AdoLinePosition;
}

export interface AdoThread {
  id: number;
  status: AdoThreadStatus;
  comments: AdoComment[];
  threadContext?: AdoThreadContext;
}

export interface AdoPullRequest {
  pullRequestId: number;
  status: string;
  title: string;
  description?: string;
  sourceRefName: string;
  targetRefName: string;
  lastMergeSourceCommit: { commitId: string };
  lastMergeTargetCommit: { commitId: string };
  repository: { id: string; project?: { id?: string; name?: string } };
  createdBy?: { id?: string; displayName?: string };
}

export interface CreateThreadInput {
  content: string;
  filePath?: string;
  line?: number;
  status?: AdoThreadStatus;
}

export type AdoPullRequestStatusState = "pending" | "succeeded" | "failed" | "error" | "notApplicable";

export interface AdoPullRequestStatusInput {
  state: AdoPullRequestStatusState;
  description: string;
  context?: { name: string; genre: string };
  targetUrl?: string;
}

export interface AdoChangedFile {
  path: string;
  changeType: "add" | "edit" | "delete" | "rename";
}

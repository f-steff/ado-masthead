// The ADO review runner is tested with fixed PR state and a deterministic model.
// This proves the sequence from changed-file retrieval through validated output
// and publication without a PAT, a live model or a browser.
import assert from "node:assert/strict";
import test from "node:test";
import {
  AdoClient,
  AdoComment,
  AdoPullRequest,
  AdoReviewClient,
  AdoThread,
  CreateThreadInput,
  runAdoReview,
  runVerification,
  storedFindingsFromThreads
} from "../src";
import type { ReviewFinding, ReviewRevision } from "../src";

const revision: ReviewRevision = { source: "a".repeat(40), target: "b".repeat(40) };
const finding: ReviewFinding = {
  id: "profile-email",
  lens: "correctness",
  severity: "major",
  confidence: "high",
  file: "src/user.ts",
  line: 6,
  title: "Profile may be absent",
  body: "The optional profile is dereferenced without a guard."
};
const botId = "bot-id";

function pr(): AdoPullRequest {
  return {
    pullRequestId: 2,
    status: "active",
    title: "Masthead test",
    description: "Synthetic fixture.",
    sourceRefName: "refs/heads/test",
    targetRefName: "refs/heads/main",
    lastMergeSourceCommit: { commitId: revision.source },
    lastMergeTargetCommit: { commitId: revision.target },
    repository: { id: "repo-id" }
  };
}

class FakeReviewClient implements AdoReviewClient {
  threads: AdoThread[] = [];
  created: CreateThreadInput[] = [];
  comments: AdoComment[] = [];
  statusUpdates: Array<{ threadId: number; status: AdoThread["status"] }> = [];
  pullRequestStatuses: Array<{ state: string; description: string }> = [];
  private nextThreadId = 10;
  private nextCommentId = 100;

  async getPullRequest(): Promise<AdoPullRequest> {
    return pr();
  }

  async getAuthenticatedIdentity(): Promise<{ id: string }> {
    return { id: botId };
  }

  async listThreads(): Promise<AdoThread[]> {
    return this.threads;
  }

  async listPullRequestChanges(): Promise<Array<{ path: string; changeType: "edit" }>> {
    return [{ path: "src/user.ts", changeType: "edit" }];
  }

  async getItemContent(_commitId: string, path: string): Promise<string | null> {
    if (path === "src/user.ts") {
      return "export function normalizeEmail(user: User) { return user.profile.email.toLowerCase(); }";
    }
    if (path === "src/user.test.ts") {
      return "import { normalizeEmail } from './user';\ntest('normalizes email', () => normalizeEmail(user));";
    }
    return null;
  }

  async createPullRequestStatus(
    _pullRequestId: number,
    input: { state: string; description: string }
  ): Promise<void> {
    this.pullRequestStatuses.push({ state: input.state, description: input.description });
  }

  async createThread(_pullRequestId: number, input: CreateThreadInput): Promise<AdoThread> {
    this.created.push(input);
    const created: AdoThread = {
      id: this.nextThreadId++,
      status: "active",
      comments: [{ id: this.nextCommentId++, author: { id: botId }, content: input.content }]
    };
    this.threads.push(created);
    return created;
  }

  async addThreadComment(
    _pullRequestId: number,
    threadId: number,
    content: string,
    parentCommentId = 0
  ): Promise<{ comment: AdoComment }> {
    const thread = this.threads.find((item) => item.id === threadId);
    if (!thread) throw new Error("missing thread");
    const comment = {
      id: this.nextCommentId++,
      parentCommentId,
      author: { id: botId },
      content
    };
    thread.comments.push(comment);
    this.comments.push(comment);
    return { comment };
  }

  async updateThreadStatus(_pullRequestId: number, threadId: number, status: AdoThread["status"]): Promise<void> {
    const thread = this.threads.find((item) => item.id === threadId);
    if (!thread) throw new Error("missing thread");
    thread.status = status;
    this.statusUpdates.push({ threadId, status });
  }
}

test("the ADO runner fetches source, runs the worker and publishes validated findings", async () => {
  const client = new FakeReviewClient();
  const prompts: Array<{ system: string; user: string }> = [];
  const run = await runAdoReview(client, {
    pullRequestId: 2,
    profile: { enabledLenses: ["correctness", "license"], reviewGuide: false },
    model: async (prompt) => {
      prompts.push(prompt);
      return {
        model: "fixture-model",
        text: JSON.stringify({ summary: "One guarded access issue.", findings: [finding] })
      };
    }
  });

  assert.equal(run.review.result.findings.length, 2);
  assert.equal(run.review.result.findings[0].id, "repository-license-missing");
  assert.deepEqual(run.published.created.map((item) => item.findingId), [
    "repository-license-missing",
    finding.id
  ]);
  assert.equal(client.created[0].filePath, undefined);
  assert.equal(client.created[1].filePath, "/src/user.ts");
  assert.equal(client.created[1].line, 6);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0].user, /src\/user\.test\.ts/);
  assert.deepEqual(run.relatedFiles, ["src/user.test.ts"]);
  assert.deepEqual(client.pullRequestStatuses, [
    { state: "pending", description: "Masthead review in progress." },
    { state: "succeeded", description: "Masthead review completed with 2 advisory findings." }
  ]);
  assert.equal(run.revision.source, revision.source);
  assert.deepEqual(storedFindingsFromThreads(client.threads, botId).map((item) => item.finding.id), [
    "repository-license-missing",
    finding.id
  ]);
});

test("a second run reuses published findings instead of creating duplicate threads", async () => {
  const client = new FakeReviewClient();
  const model = async (prompt: { system: string }) => prompt.system.includes("rechecking earlier review findings")
    ? {
        model: "fixture-model",
        text: JSON.stringify({
          verifications: [
            { findingId: "repository-license-missing", outcome: "still-present", reason: "The root LICENSE is still absent." },
            { findingId: finding.id, outcome: "still-present", reason: "The same unguarded access remains." }
          ]
        })
      }
    : {
        model: "fixture-model",
        text: JSON.stringify({ summary: "Same finding.", findings: [finding] })
      };
  await runAdoReview(client, {
    pullRequestId: 2,
    profile: { enabledLenses: ["correctness", "license"], reviewGuide: false },
    model
  });
  const firstCount = client.created.length;
  const second = await runAdoReview(client, {
    pullRequestId: 2,
    profile: { enabledLenses: ["correctness", "license"], reviewGuide: false },
    model
  });
  assert.equal(client.created.length, firstCount);
  assert.deepEqual(second.published.created, []);
  assert.equal(second.verification.length, 2);
});

test("an evidence-backed verification resolves only the bot finding thread", async () => {
  const client = new FakeReviewClient();
  const first = await runAdoReview(client, {
    pullRequestId: 2,
    profile: { enabledLenses: ["correctness"], reviewGuide: false },
    model: async () => ({
      model: "fixture-model",
      text: JSON.stringify({ summary: "One finding.", findings: [finding] })
    })
  });
  assert.equal(first.published.created.length, 1);
  const threadId = first.published.created[0].threadId;
  const second = await runAdoReview(client, {
    pullRequestId: 2,
    profile: { enabledLenses: ["correctness"], reviewGuide: false },
    model: async (prompt: { system: string }) => prompt.system.includes("rechecking earlier review findings")
      ? {
          model: "fixture-model",
          text: JSON.stringify({
            verifications: [{ findingId: finding.id, outcome: "fixed", reason: "The current code guards profile before reading email." }]
          })
        }
      : { model: "fixture-model", text: JSON.stringify({ summary: "No new findings.", findings: [] }) }
  });
  assert.deepEqual(second.published.resolved, [{ findingId: finding.id, threadId }]);
  assert.equal(client.statusUpdates[0].status, "fixed");
  assert.equal(client.threads.find((item) => item.id === threadId)?.status, "fixed");
});

test("the runner refuses to publish against a closed pull request", async () => {
  const client = new FakeReviewClient();
  const base = await client.getPullRequest();
  client.getPullRequest = async () => ({ ...base, status: "completed" });
  await assert.rejects(
    () => runAdoReview(client, {
      pullRequestId: 2,
      profile: { enabledLenses: ["correctness"], reviewGuide: false },
      model: async () => ({ model: "fixture", text: "{}" })
    }),
    /not active/
  );
});

test("the runner rejects changed files that exceed its bounded input", async () => {
  const client = new FakeReviewClient();
  await assert.rejects(
    () => runAdoReview(client, {
      pullRequestId: 2,
      profile: { enabledLenses: ["correctness"], reviewGuide: false },
      model: async () => ({ model: "fixture", text: "{}" }),
      maxFileCharacters: 10
    }),
    /content budget/
  );
  assert.deepEqual(client.pullRequestStatuses, [
    { state: "pending", description: "Masthead review in progress." },
    { state: "error", description: "Masthead review failed before completion." }
  ]);
});

test("verification requires known finding IDs and evidence for a fix", async () => {
  const stored = [{ finding, threadId: 1, ownerId: botId, state: "active" as const }];
  const changedFiles = [{ path: "src/user.ts", changeType: "edit" as const, content: "const email = user.profile?.email;" }];
  const fixed = await runVerification(
    { findings: stored, changedFiles, revision },
    async () => ({
      model: "fixture",
      text: JSON.stringify({
        verifications: [{ findingId: finding.id, outcome: "fixed", reason: "The profile is optional-chained at the same call site." }]
      })
    })
  );
  assert.deepEqual(fixed.verifications.map((item) => [item.findingId, item.outcome]), [
    [finding.id, "fixed"]
  ]);
  await assert.rejects(() => runVerification(
    { findings: stored, changedFiles, revision },
    async () => ({
      model: "fixture",
      text: JSON.stringify({ verifications: [{ findingId: "unknown", outcome: "fixed", reason: "x" }] })
    })
  ), /unknown/);
  let calls = 0;
  const empty = await runVerification(
    { findings: [], changedFiles, revision },
    async () => {
      calls += 1;
      return { model: "fixture", text: "{}" };
    }
  );
  assert.deepEqual(empty.verifications, []);
  assert.equal(calls, 0);
});

test("the publisher helper accepts only bot-owned metadata from the runner's thread state", async () => {
  const client = new FakeReviewClient();
  await client.createThread(2, { content: "human text" });
  assert.deepEqual(storedFindingsFromThreads(client.threads, botId), []);
  assert.deepEqual(storedFindingsFromThreads(client.threads, "another-bot"), []);
});

test("the REST client reads iteration changes and treats a missing LICENSE as absent", async () => {
  const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("/iterations?")) return json({ value: [{ id: 7 }] });
    if (url.includes("/iterations/7/changes")) {
      return json({ changeEntries: [{ item: { path: "/src/user.ts", isFolder: false }, changeType: "edit" }] });
    }
    if (url.includes("/items?path=")) {
      if (url.includes("LICENSE")) return new Response("{}", { status: 404 });
      return json({ content: "export const value = 1;" });
    }
    return json(pr());
  };
  const client = new AdoClient({
    organizationUrl: "https://dev.azure.com/contoso",
    project: "SampleProject",
    repositoryId: "repo-id",
    token: "test-token",
    fetchImpl
  });
  const changes = await client.listPullRequestChanges(2);
  assert.deepEqual(changes, [{ path: "src/user.ts", changeType: "edit" }]);
  assert.equal(await client.getItemContent(revision.source, "LICENSE"), null);
  assert.equal(await client.getItemContent(revision.source, "src/user.ts"), "export const value = 1;");
});

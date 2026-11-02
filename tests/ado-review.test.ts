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
    return null;
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

  async addThreadComment(): Promise<{ comment: AdoComment }> {
    throw new Error("not used");
  }

  async updateThreadStatus(): Promise<void> {
    throw new Error("not used");
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
  assert.equal(run.revision.source, revision.source);
  assert.deepEqual(storedFindingsFromThreads(client.threads, botId).map((item) => item.finding.id), [
    "repository-license-missing",
    finding.id
  ]);
});

test("a second run reuses published findings instead of creating duplicate threads", async () => {
  const client = new FakeReviewClient();
  const model = async () => ({
    model: "fixture-model",
    text: JSON.stringify({ summary: "Same finding.", findings: [finding] })
  });
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

// Publisher tests use an in-memory ADO thread client. They verify ownership,
// revision freshness, persistent metadata and idempotent publication without
// requiring a PAT, a browser or a live pipeline.
import assert from "node:assert/strict";
import test from "node:test";
import {
  AdoClient,
  AdoClientLike,
  AdoComment,
  AdoPullRequest,
  AdoThread,
  CreateThreadInput,
  decodeFindingMetadata,
  encodeFindingMetadata,
  FindingThreadMetadata,
  publishReviewPlan,
  reconcileFindings,
  renderFindingComment,
  renderResolutionComment,
  storedFindingsFromThreads
} from "../src";
import type { ReviewFinding, ReviewRevision } from "../src";

const finding: ReviewFinding = {
  id: "profile-email",
  lens: "correctness",
  severity: "major",
  confidence: "high",
  file: "src/user.ts",
  line: 6,
  title: "Profile may be absent",
  body: "The optional profile is dereferenced without a guard.",
  suggestion: "Guard the profile before reading email."
};
const revision: ReviewRevision = { source: "a".repeat(40), target: "b".repeat(40) };
const botId = "bot-id";
const humanId = "human-id";

function metadata(state: FindingThreadMetadata["state"] = "active", value = finding): FindingThreadMetadata {
  return { version: 1, kind: "finding", finding: value, ownerId: botId, revision, state };
}

function comment(id: number, authorId: string, content: string, parentCommentId?: number): AdoComment {
  return { id, author: { id: authorId }, content, ...(parentCommentId === undefined ? {} : { parentCommentId }) };
}

function thread(id: number, status: AdoThread["status"], comments: AdoComment[]): AdoThread {
  return { id, status, comments };
}

function pullRequest(): AdoPullRequest {
  return {
    pullRequestId: 2,
    status: "active",
    title: "Fixture",
    sourceRefName: "refs/heads/test",
    targetRefName: "refs/heads/main",
    lastMergeSourceCommit: { commitId: revision.source },
    lastMergeTargetCommit: { commitId: revision.target },
    repository: { id: "repo-id", project: { id: "project-id", name: "StaticEmpty" } }
  };
}

class FakeThreadClient implements AdoClientLike {
  threads: AdoThread[] = [];
  created: CreateThreadInput[] = [];
  statusUpdates: Array<{ threadId: number; status: AdoThread["status"] }> = [];
  comments: AdoComment[] = [];
  private nextId = 10;
  private nextCommentId = 100;

  constructor(private readonly pr: AdoPullRequest = pullRequest()) {}

  async getPullRequest(_pullRequestId: number): Promise<AdoPullRequest> {
    return this.pr;
  }

  async getAuthenticatedIdentity(): Promise<{ id: string }> {
    return { id: botId };
  }

  async listThreads(_pullRequestId: number): Promise<AdoThread[]> {
    return this.threads;
  }

  async createThread(_pullRequestId: number, input: CreateThreadInput): Promise<AdoThread> {
    this.created.push(input);
    const created = thread(this.nextId, "active", [
      comment(this.nextCommentId++, botId, input.content)
    ]);
    this.threads.push(created);
    return created;
  }

  async addThreadComment(
    _pullRequestId: number,
    threadId: number,
    content: string,
    parentCommentId = 0
  ): Promise<{ comment: AdoComment }> {
    const target = this.threads.find((item) => item.id === threadId);
    if (!target) throw new Error("missing thread");
    const value = comment(this.nextCommentId++, botId, content, parentCommentId);
    target.comments.push(value);
    this.comments.push(value);
    return { comment: value };
  }

  async updateThreadStatus(_pullRequestId: number, threadId: number, status: AdoThread["status"]): Promise<void> {
    const target = this.threads.find((item) => item.id === threadId);
    if (!target) throw new Error("missing thread");
    target.status = status;
    this.statusUpdates.push({ threadId, status });
  }
}

test("finding metadata round-trips and comment rendering starts with the marker", () => {
  const original = metadata();
  const content = renderFindingComment(original);
  assert.ok(content.startsWith("<!-- masthead:1:"));
  assert.match(content, /Profile may be absent/);
  assert.deepEqual(decodeFindingMetadata(content), original);
  const escaped = renderFindingComment({ ...original, finding: { ...finding, title: "<script>alert(1)</script>" } });
  assert.match(escaped, /&lt;script&gt;/);
  assert.doesNotMatch(escaped, /<script>/);
  assert.equal(decodeFindingMetadata("<!-- masthead:1:not-base64 -->"), undefined);
  assert.equal(decodeFindingMetadata("human comment"), undefined);
  const altered = encodeFindingMetadata({ ...original, finding: { ...finding, file: "../secret" } });
  assert.equal(decodeFindingMetadata(altered), undefined);
});

test("stored findings distinguish bot fixes, human resolutions and human-authored markers", () => {
  const active = thread(1, "active", [comment(1, botId, renderFindingComment(metadata()))]);
  const botFixed = thread(2, "fixed", [
    comment(2, botId, renderFindingComment(metadata())),
    comment(3, botId, renderResolutionComment({ ...metadata("bot-fixed") }, "Verified fix."))
  ]);
  const humanFixed = thread(3, "fixed", [comment(4, botId, renderFindingComment(metadata()))]);
  const dismissed = thread(4, "wontFix", [comment(5, botId, renderFindingComment(metadata()))]);
  const forged = thread(5, "active", [comment(6, humanId, renderFindingComment(metadata()))]);
  const values = storedFindingsFromThreads([active, botFixed, humanFixed, dismissed, forged], botId);
  assert.deepEqual(values.map((item) => [item.threadId, item.state]), [
    [1, "active"],
    [2, "bot-fixed"],
    [3, "human-resolved"],
    [4, "dismissed"]
  ]);
});

test("publication creates one inline thread and is idempotent on retry", async () => {
  const client = new FakeThreadClient();
  const plan = reconcileFindings([], { summary: "One finding.", findings: [finding] }, [], revision, revision, botId);
  const first = await publishReviewPlan(client, { pullRequestId: 2, revision, botId, plan });
  assert.deepEqual(first.created, [{ findingId: finding.id, threadId: 10 }]);
  assert.equal(client.created[0].filePath, "/src/user.ts");
  assert.equal(client.created[0].line, 6);
  assert.match(client.created[0].content, /masthead:1:/);

  const second = await publishReviewPlan(client, { pullRequestId: 2, revision, botId, plan });
  assert.deepEqual(second.created, []);
  assert.equal(second.skipped[0].findingId, finding.id);
  assert.equal(client.created.length, 1);
});

test("a verified fix replies with metadata and closes only the bot thread", async () => {
  const client = new FakeThreadClient();
  client.threads.push(thread(10, "active", [comment(1, botId, renderFindingComment(metadata()))]));
  const previous = storedFindingsFromThreads(client.threads, botId);
  const plan = reconcileFindings(previous, { summary: "Fixed.", findings: [] }, [{
    findingId: finding.id,
    outcome: "fixed",
    revision,
    reason: "The current code guards the optional profile."
  }], revision, revision, botId);
  const published = await publishReviewPlan(client, { pullRequestId: 2, revision, botId, plan });
  assert.deepEqual(published.resolved, [{ findingId: finding.id, threadId: 10 }]);
  assert.equal(client.statusUpdates[0].status, "fixed");
  const resolution = decodeFindingMetadata(client.comments[0].content ?? "");
  assert.equal(resolution?.state, "bot-fixed");
  assert.match(client.comments[0].content ?? "", /guards the optional profile/);
});

test("a human-owned or forged thread cannot be resolved, and stale revisions are rejected", async () => {
  const human = new FakeThreadClient();
  human.threads.push(thread(10, "active", [comment(1, humanId, "I fixed this myself.")]));
  const humanPlan = {
    stale: false,
    actions: [{ kind: "resolve" as const, findingId: finding.id, threadId: 10, reason: "Verified." }],
    openFindingIds: [],
    summary: ""
  };
  await assert.rejects(
    () => publishReviewPlan(human, { pullRequestId: 2, revision, botId, plan: humanPlan }),
    /no longer available/
  );

  const stale = new FakeThreadClient({ ...pullRequest(), lastMergeSourceCommit: { commitId: "c".repeat(40) } });
  const plan = reconcileFindings([], { summary: "x", findings: [finding] }, [], revision, revision, botId);
  await assert.rejects(
    () => publishReviewPlan(stale, { pullRequestId: 2, revision, botId, plan }),
    /no longer current/
  );
});

test("the REST client keeps the token out of URLs and sends an inline thread context", async () => {
  const calls: Array<{ url: string; options: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, options) => {
    calls.push({ url: String(input), options: options ?? {} });
    if (String(input).includes("/threads") && options?.method === "POST") {
      return new Response(JSON.stringify({ id: 4, status: "active", comments: [] }), { status: 200 });
    }
    return new Response(JSON.stringify(pullRequest()), { status: 200 });
  };
  const client = new AdoClient({
    organizationUrl: "https://dev.azure.com/contoso",
    project: "SampleProject",
    repositoryId: "repo-id",
    token: "secret-token",
    fetchImpl
  });
  await client.getPullRequest(2);
  assert.match(calls[0].url, /dev\.azure\.com\/contoso\/SampleProject\/_apis\/git\/repositories\/repo-id\/pullRequests\/2/);
  assert.ok(!calls[0].url.includes("secret-token"));
  assert.equal((calls[0].options.headers as Record<string, string>).authorization,
    `Basic ${Buffer.from(":secret-token").toString("base64")}`);
  const created = await client.createThread(2, {
    content: "Hello",
    filePath: "/src/user.ts",
    line: 6
  });
  assert.equal(created.id, 4);
  const body = JSON.parse(String(calls[1].options.body));
  assert.deepEqual(body.threadContext, {
    filePath: "/src/user.ts",
    rightFileStart: { line: 6, offset: 1 },
    rightFileEnd: { line: 6, offset: 1 }
  });
  assert.throws(() => new AdoClient({
    organizationUrl: "http://remote.test",
    project: "P",
    repositoryId: "R",
    token: "t",
    fetchImpl
  }), /HTTPS/);
});

test("the REST client requests the preview connectionData API", async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({
      authenticatedUser: { id: botId, providerDisplayName: "Masthead" }
    }), { status: 200 });
  };
  const client = new AdoClient({
    organizationUrl: "https://dev.azure.com/contoso",
    project: "SampleProject",
    repositoryId: "repo-id",
    token: "pipeline-token",
    tokenScheme: "bearer",
    fetchImpl
  });
  const identity = await client.getAuthenticatedIdentity();
  assert.equal(identity.id, botId);
  assert.match(calls[0], /connectionData\?api-version=7\.1-preview$/);
});

test("the REST client uses bearer authentication for a pipeline access token", async () => {
  let authorization = "";
  const fetchImpl: typeof fetch = async (_input, options) => {
    authorization = (options?.headers as Record<string, string>).authorization;
    return new Response(JSON.stringify(pullRequest()), { status: 200 });
  };
  const client = new AdoClient({
    organizationUrl: "https://dev.azure.com/contoso",
    project: "SampleProject",
    repositoryId: "repo-id",
    token: "pipeline-token",
    tokenScheme: "bearer",
    fetchImpl
  });
  await client.getPullRequest(2);
  assert.equal(authorization, "Bearer pipeline-token");
});

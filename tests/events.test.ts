// Event routing uses trusted, re-fetched PR/thread state and the repository switch.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEvent, decideEvent, defaultProjectSettings, seedRepositories } from "../src";
import type { EventContext } from "../src";

const payload = { id: "event-1", eventType: "git.pullrequest.updated", resource: {
  pullRequestId: 1, repository: { id: "repo-1", project: { id: "project-1" } }
} };
const event = normalizeEvent(payload);
const project = seedRepositories(defaultProjectSettings(), ["repo-1"], true);
const context: EventContext = { projectId: "project-1", repositoryId: "repo-1", pullRequestId: 1,
  status: "active", authorId: "author", botId: "bot", revision: { source: "source-1", target: "target-1" } };

test("a project/repository switch gates all review calls", () => {
  assert.equal(decideEvent(event, defaultProjectSettings(), context).operation, "ignore");
  assert.equal(decideEvent(event, { ...project, enabled: false }, context).operation, "ignore");
  assert.equal(decideEvent(event, project, context).operation, "review");
});

test("metadata-only updates are skipped but a changed source or target requires review", () => {
  const reviewed = { ...context, lastReviewed: context.revision };
  assert.equal(decideEvent(event, project, reviewed).operation, "ignore");
  assert.equal(decideEvent(event, project, { ...reviewed, revision: { ...context.revision, source: "source-2" } }).operation, "review");
  assert.equal(decideEvent(event, project, { ...reviewed, revision: { ...context.revision, target: "target-2" } }).operation, "review");
});

test("closed PRs and mismatched resources cannot trigger analysis", () => {
  assert.equal(decideEvent(event, project, { ...context, status: "completed" }).operation, "ignore");
  assert.equal(decideEvent(event, project, { ...context, repositoryId: "other" }).operation, "ignore");
});

test("author replies need no mention, but own/answered comments and unrelated threads are ignored", () => {
  const commented = { ...event, comment: { id: 2, threadId: 3, authorId: "untrusted", revision: "old" } };
  const comment = { id: 2, threadId: 3, authorId: "author", threadOwnerId: "bot", explicitMention: false, revision: "version-2" };
  assert.equal(decideEvent(commented, project, { ...context, comment }).operation, "reply");
  assert.equal(decideEvent(commented, project, { ...context, comment: { ...comment, authorId: "bot" } }).operation, "ignore");
  assert.equal(decideEvent(commented, project, { ...context, comment: { ...comment, lastAnsweredRevision: "version-2" } }).operation, "ignore");
  assert.equal(decideEvent(commented, project, { ...context, comment: { ...comment, threadOwnerId: "human" } }).operation, "ignore");
  assert.equal(decideEvent(commented, project, { ...context, comment: { ...comment, threadOwnerId: "human", explicitMention: true } }).operation, "reply");
});

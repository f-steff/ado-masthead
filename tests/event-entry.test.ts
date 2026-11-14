import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyComment,
  hasBotReply,
  nativeEventEnvironment,
  parseEventEnvelope,
  renderReply,
  truthy
} from "../src";
import type { AdoComment, AdoThread, NormalizedPrEvent } from "../src";

test("manual and review events carry only trusted envelope fields", () => {
  assert.deepEqual(parseEventEnvelope({}), { eventType: "manual" });
  assert.deepEqual(parseEventEnvelope({
    MASTHEAD_EVENT_TYPE: "git.pullrequest.created",
    MASTHEAD_DELIVERY_KEY: "git.pullrequest.created:event-1"
  }), {
    eventType: "git.pullrequest.created",
    deliveryKey: "git.pullrequest.created:event-1"
  });
  assert.deepEqual(parseEventEnvelope({
    MASTHEAD_EVENT_TYPE: "ms.vss-code.git-pullrequest-comment-event",
    MASTHEAD_THREAD_ID: "3",
    MASTHEAD_COMMENT_ID: "2",
    MASTHEAD_COMMENT_REVISION: "2026-11-13T07:00:00Z"
  }), {
    eventType: "ms.vss-code.git-pullrequest-comment-event",
    threadId: 3,
    commentId: 2,
    commentRevision: "2026-11-13T07:00:00Z"
  });
});

test("the event envelope rejects unknown events and malformed identifiers", () => {
  assert.throws(() => parseEventEnvelope({ MASTHEAD_EVENT_TYPE: "git.push" }), /Unsupported/);
  assert.throws(() => parseEventEnvelope({
    MASTHEAD_EVENT_TYPE: "ms.vss-code.git-pullrequest-comment-event",
    MASTHEAD_THREAD_ID: "0",
    MASTHEAD_COMMENT_ID: "2"
  }), /THREAD_ID/);
  assert.throws(() => parseEventEnvelope({
    MASTHEAD_EVENT_TYPE: "ms.vss-code.git-pullrequest-comment-event",
    MASTHEAD_THREAD_ID: "3",
    MASTHEAD_COMMENT_ID: "2",
    MASTHEAD_COMMENT_REVISION: "yesterday"
  }), /COMMENT_REVISION/);
  assert.throws(() => parseEventEnvelope({
    MASTHEAD_DELIVERY_KEY: "bad key"
  }), /DELIVERY_KEY/);
});

test("comment authors are classified without trusting display text", () => {
  const comment = (id: number, authorId: string): AdoComment => ({ id, author: { id: authorId }, content: "text" });
  assert.equal(classifyComment(comment(1, "bot"), "bot", "author"), "masthead");
  assert.equal(classifyComment(comment(2, "author"), "bot", "author"), "author");
  assert.equal(classifyComment(comment(3, "reviewer"), "bot", "author"), "reviewer");
  assert.equal(classifyComment({ id: 4, content: "x" }, "bot", "author"), "reviewer");
});

test("a bot reply parented to a comment prevents a duplicate answer", () => {
  const thread: AdoThread = {
    id: 3,
    status: "active",
    comments: [
      { id: 2, parentCommentId: 0, author: { id: "author" }, content: "question" },
      { id: 4, parentCommentId: 2, author: { id: "bot" }, content: "answer" }
    ]
  };
  assert.equal(hasBotReply(thread, 2, "bot"), true);
  assert.equal(hasBotReply(thread, 3, "bot"), false);
});

test("model replies cannot inject raw HTML into an ADO comment", () => {
  assert.equal(renderReply("<b>answer</b> & more"), "&lt;b&gt;answer&lt;/b&gt; &amp; more");
});

test("pipeline booleans accept the Azure Pipelines True spelling", () => {
  assert.equal(truthy("True"), true);
  assert.equal(truthy("true"), true);
  assert.equal(truthy("1"), true);
  assert.equal(truthy("False"), false);
  assert.equal(truthy(undefined), false);
});

test("normalized native events become the shared job environment", () => {
  const review: NormalizedPrEvent = {
    eventType: "git.pullrequest.updated",
    deliveryKey: "git.pullrequest.updated:event-1",
    projectId: "project-1",
    repositoryId: "repo-1",
    pullRequestId: 7,
    sourceCommit: "a".repeat(40),
    targetCommit: "b".repeat(40),
    status: "active"
  };
  const reviewEnv = nativeEventEnvironment({ AZURE_DEVOPS_ORG_URL: "https://dev.azure.com/contoso" }, review);
  assert.equal(reviewEnv.env.MASTHEAD_PROJECT, "project-1");
  assert.equal(reviewEnv.env.MASTHEAD_REPOSITORY, "repo-1");
  assert.equal(reviewEnv.env.MASTHEAD_PULL_REQUEST_ID, "7");
  assert.equal(reviewEnv.env.MASTHEAD_EVENT_TYPE, "git.pullrequest.updated");
  assert.equal(reviewEnv.env.MASTHEAD_THREAD_ID, undefined);
  assert.equal(reviewEnv.envelope.threadId, undefined);

  const comment: NormalizedPrEvent = {
    ...review,
    eventType: "ms.vss-code.git-pullrequest-comment-event",
    comment: { id: 2, threadId: 4, authorId: "author", revision: "2026-11-14T00:00:00Z" }
  };
  const commentEnv = nativeEventEnvironment({}, comment);
  assert.equal(commentEnv.env.MASTHEAD_THREAD_ID, "4");
  assert.equal(commentEnv.env.MASTHEAD_COMMENT_ID, "2");
  assert.equal(commentEnv.env.MASTHEAD_COMMENT_REVISION, "2026-11-14T00:00:00Z");
  assert.equal(commentEnv.envelope.commentId, 2);
  assert.throws(() => nativeEventEnvironment({}, { ...review, eventType: "git.push" }), /Unsupported/);
});

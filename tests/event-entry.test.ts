import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyComment,
  hasBotReply,
  parseEventEnvelope,
  renderReply,
  truthy
} from "../src";
import type { AdoComment, AdoThread } from "../src";

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

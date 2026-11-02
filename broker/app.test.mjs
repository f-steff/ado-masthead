// HTTP integration tests exercise the real receiver on loopback with a fake
// ADO fetch. They never contact an organization or require Docker/credentials.
import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createBroker } from "./app.mjs";
import { buildQueueBody, normalizeEvent } from "./lib.mjs";

const secret = "test-only-".repeat(4);
const payload = {
  id: "event-1", eventType: "git.pullrequest.updated", notificationId: 1,
  resource: { pullRequestId: 7, repository: { id: "repo-1", project: { id: "project-1" } } }
};

/** Bind a fresh ephemeral port and close connections even after an assertion fails. */
async function receiver(context, fetchImpl, options = {}, dependencies = {}) {
  const server = createBroker({ secret, org: "https://dev.azure.com/contoso", project: "Central", pipelineId: 10, token: "test-only", ...options }, { fetchImpl, ...dependencies });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

/** Only synthetic IDs enter loopback requests. */
function eventRequest(base, value = payload, password = secret) {
  return fetch(base + "/event", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`test:${password}`).toString("base64")}` },
    body: JSON.stringify(value)
  });
}

test("broker normalizes nested comment events, thread IDs and project IDs", () => {
  const event = normalizeEvent({ ...payload, eventType: "ms.vss-code.git-pullrequest-comment-event", resource: {
    pullRequest: payload.resource,
    comment: { id: 2, author: { id: "author" }, lastContentUpdatedDate: "2026-10-31T12:00:00Z",
      _links: { self: { href: "https://example.test/pr/7/threads/3/comments/2" } } }
  } });
  assert.equal(event.projectId, "project-1");
  assert.equal(event.comment.threadId, 3);
  const queued = buildQueueBody(event, 10);
  assert.equal(queued.templateParameters.mastheadCommentId, "2");
  assert.equal(queued.templateParameters.mastheadThreadId, "3");
  assert.ok(!JSON.stringify(queued).includes("example.test"));
});

test("delivery identity prefers event IDs and scopes notification fallback to a subscription", () => {
  assert.notEqual(normalizeEvent(payload).deliveryKey, normalizeEvent({ ...payload, id: "other-event" }).deliveryKey);
  assert.throws(() => normalizeEvent({ ...payload, id: undefined }), /delivery identifier/);
  const fallback = normalizeEvent({ ...payload, id: undefined, subscriptionId: "subscription-1" });
  assert.match(fallback.deliveryKey, /subscription-1:1/);
});

test("invalid identifiers and commits cannot become pipeline parameters", () => {
  for (const resource of [{ ...payload.resource, pullRequestId: "1; echo secret" },
    { ...payload.resource, repository: { id: "../repo", project: { id: "project" } } },
    { ...payload.resource, lastMergeSourceCommit: { commitId: "$(secret)" } }]) {
    assert.throws(() => normalizeEvent({ ...payload, resource }));
  }
});

test("unauthorized and malformed requests never queue a pipeline", async (context) => {
  let calls = 0;
  const base = await receiver(context, async () => { calls += 1; return Response.json({ id: 1 }); });
  assert.equal((await eventRequest(base, payload, "wrong")).status, 401);
  assert.equal((await eventRequest(base, {})).status, 400);
  assert.equal(calls, 0);
});

test("only successful queue requests are deduplicated; failures remain retryable", async (context) => {
  let calls = 0;
  const base = await receiver(context, async (url, options) => {
    calls += 1;
    assert.match(url, /\/Central\/_apis\/build\/builds/);
    assert.equal(options.redirect, "error");
    assert.equal(JSON.parse(options.body).definition.id, 10);
    return calls === 1 ? new Response("private error", { status: 503 }) : Response.json({ id: 1 });
  });
  const failed = await eventRequest(base);
  assert.equal(failed.status, 502);
  assert.ok(!(await failed.text()).includes("private error"));
  assert.equal((await eventRequest(base)).status, 202);
  assert.equal((await (await eventRequest(base)).json()).status, "duplicate");
  assert.equal(calls, 2);
});

test("overlapping duplicate deliveries retry rather than acknowledge unfinished work", async (context) => {
  let release;
  let started;
  const entered = new Promise((resolve) => { started = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  const base = await receiver(context, async () => { started(); await pending; return Response.json({ id: 1 }); });
  const first = eventRequest(base);
  await entered;
  try {
    assert.equal((await eventRequest(base)).status, 503);
  } finally {
    release();
  }
  assert.equal((await first).status, 202);
});

test("bounded deduplication memory rejects new work at capacity", async (context) => {
  const base = await receiver(context, async () => Response.json({ id: 1 }), { maxEntries: 1 });
  assert.equal((await eventRequest(base)).status, 202);
  assert.equal((await eventRequest(base, { ...payload, id: "event-2" })).status, 429);
});

test("completed delivery cache expires without a wall-clock delay", async (context) => {
  let time = 0;
  let calls = 0;
  const base = await receiver(context, async () => { calls += 1; return Response.json({ id: calls }); }, { dedupeMs: 10 }, { now: () => time });
  await eventRequest(base);
  assert.equal((await (await eventRequest(base)).json()).status, "duplicate");
  time = 11;
  assert.equal((await (await eventRequest(base)).json()).status, "queued");
  assert.equal(calls, 2);
});

test("queue timeouts produce retryable errors without exposing endpoint details", async (context) => {
  const base = await receiver(context, async (_url, options) => new Promise((_resolve, reject) => {
    if (options.signal.aborted) reject(new Error("private timeout detail"));
    options.signal.addEventListener("abort", () => reject(new Error("private timeout detail")), { once: true });
  }), { queueTimeoutMs: 10 });
  const response = await eventRequest(base);
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("private"));
});

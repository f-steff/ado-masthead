// Review locks use Azure DevOps extension data documents. These tests exercise
// the concurrency decisions with an in-memory collection and never call ADO.
import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireReviewLock,
  lockIsStale,
  reviewLockDocumentId,
  ReviewLockOptions
} from "../src/worker/review-lock";

const revision = {
  projectId: "11111111-1111-1111-1111-111111111111",
  repositoryId: "22222222-2222-2222-2222-222222222222",
  pullRequestId: 7,
  source: "a".repeat(40),
  target: "b".repeat(40)
};

interface Stored {
  id: string;
  __etag: number;
  value: Record<string, unknown>;
}

function collection(fetchImpl?: typeof fetch) {
  const documents = new Map<string, Stored>();
  const calls: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
  let nextEtag = 1;
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ method, url, ...(body ? { body } : {}) });
    if (method === "POST") {
      if (documents.has(String(body?.id))) return new Response("", { status: 409 });
      const document = { id: String(body?.id), __etag: nextEtag++, value: body?.value as Record<string, unknown> };
      documents.set(document.id, document);
      return new Response(JSON.stringify(document), { status: 200 });
    }
    const id = decodeURIComponent(url.split("/Documents/")[1]?.split("?")[0] ?? "");
    const document = documents.get(id);
    if (method === "GET") {
      return document
        ? new Response(JSON.stringify(document), { status: 200 })
        : new Response("", { status: 404 });
    }
    if (method === "PUT") {
      if (!document || document.__etag !== body?.__etag) return new Response("", { status: 412 });
      const next = { id, __etag: nextEtag++, value: body?.value as Record<string, unknown> };
      documents.set(id, next);
      return new Response(JSON.stringify(next), { status: 200 });
    }
    if (method === "DELETE") {
      documents.delete(id);
      return new Response(null, { status: 204 });
    }
    return new Response("", { status: 405 });
  };
  return { documents, calls, fetchImpl: fetchImpl ?? fakeFetch };
}

function options(fetchImpl: typeof fetch, overrides: Partial<ReviewLockOptions> = {}): ReviewLockOptions {
  return {
    organizationUrl: "https://dev.azure.com/contoso",
    token: "test-only-token",
    tokenScheme: "bearer",
    publisher: "f-steff",
    extensionId: "masthead-dev",
    ...revision,
    fetchImpl,
    now: () => new Date("2026-11-15T12:00:00.000Z"),
    ...overrides
  };
}

test("review lock ids are deterministic and stay within the document id limit", () => {
  const id = reviewLockDocumentId(revision);
  assert.equal(id, reviewLockDocumentId({ ...revision, projectId: revision.projectId.toUpperCase() }));
  assert.match(id, /^m-[a-f\d]{40}$/);
  assert.ok(id.length <= 50);
  assert.notEqual(id, reviewLockDocumentId({ ...revision, target: "c".repeat(40) }));
  assert.throws(() => reviewLockDocumentId({ ...revision, pullRequestId: 0 }));
  assert.throws(() => reviewLockDocumentId({ ...revision, source: "not-a-commit" }));
});

test("acquiring a free review creates one document and releases only its own lock", async () => {
  const store = collection();
  const result = await acquireReviewLock(options(store.fetchImpl));
  assert.equal(result.state, "acquired");
  if (result.state !== "acquired") return;
  assert.equal(store.documents.size, 1);
  assert.equal(store.calls[0].method, "POST");
  assert.match(store.calls[0].url, /\/Collections\/mastheadLocks\/Documents\?api-version=6\.0-preview\.1$/);

  await result.lock.release();
  assert.equal(store.documents.size, 0);
  assert.deepEqual(store.calls.map((call) => call.method), ["POST", "GET", "DELETE"]);
});

test("a fresh lock is held and is not overwritten", async () => {
  const store = collection();
  const first = await acquireReviewLock(options(store.fetchImpl));
  assert.equal(first.state, "acquired");

  const second = await acquireReviewLock(options(store.fetchImpl, {
    now: () => new Date("2026-11-15T12:05:00.000Z")
  }));
  assert.equal(second.state, "held");
  assert.equal(second.state === "held" ? second.acquiredAt : undefined, "2026-11-15T12:00:00.000Z");
  assert.equal(store.documents.size, 1);
});

test("a stale lock is replaced with an ETag-guarded update", async () => {
  const store = collection();
  const first = await acquireReviewLock(options(store.fetchImpl));
  assert.equal(first.state, "acquired");
  if (first.state !== "acquired") return;
  const id = first.lock.id;
  const stale = store.documents.get(id);
  assert.ok(stale);

  const takeover = await acquireReviewLock(options(store.fetchImpl, {
    now: () => new Date("2026-11-15T13:00:00.000Z")
  }));
  assert.equal(takeover.state, "acquired");
  if (takeover.state !== "acquired") return;
  assert.equal(takeover.lock.id, id);
  const put = store.calls.find((call) => call.method === "PUT");
  assert.equal(put?.body?.__etag, stale.__etag);
  assert.notEqual((store.documents.get(id)?.value.owner), stale.value.owner);

  // The first worker no longer owns the document and must not delete it.
  await first.lock.release();
  assert.ok(store.documents.has(id));
  await takeover.lock.release();
  assert.equal(store.documents.has(id), false);
});

test("a concurrent stale takeover loses the ETag race and reports held", async () => {
  const store = collection(async (_input, init) => {
    if ((init?.method ?? "GET") === "POST") return new Response("", { status: 409 });
    if ((init?.method ?? "GET") === "GET") {
      return new Response(JSON.stringify({
        id: "m-lock",
        __etag: 9,
        value: { owner: "old", acquiredAt: "2020-01-01T00:00:00.000Z" }
      }), { status: 200 });
    }
    if (init?.method === "PUT") return new Response("", { status: 412 });
    return new Response("", { status: 404 });
  });
  const result = await acquireReviewLock(options(store.fetchImpl));
  assert.equal(result.state, "held");
});

test("a data-service failure makes the lock unavailable instead of throwing", async () => {
  const result = await acquireReviewLock(options(async () => {
    throw new Error("network down");
  }));
  assert.equal(result.state, "unavailable");
  assert.match(result.state === "unavailable" ? result.message : "", /could not be completed/);
});

test("locks without a usable timestamp are stale", () => {
  const now = Date.parse("2026-11-15T12:00:00.000Z");
  assert.equal(lockIsStale({ acquiredAt: "not-a-date" }, now, 1_000), true);
  assert.equal(lockIsStale({}, now, 1_000), true);
  assert.equal(lockIsStale({ acquiredAt: "2026-11-15T11:59:59.000Z" }, now, 1_000), true);
  assert.equal(lockIsStale({ acquiredAt: "2026-11-15T11:59:59.500Z" }, now, 1_000), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildQueueBody, isAuthorized, parseEvent, queueUrl } from "./lib.mjs";

const secret = "correct-secret";
const basic = `Basic ${Buffer.from(`anything:${secret}`).toString("base64")}`;

test("broker accepts the shared secret through Basic auth or its header", () => {
  assert.equal(isAuthorized({ authorization: basic }, secret), true);
  assert.equal(isAuthorized({ "x-masthead-secret": secret }, secret), true);
  assert.equal(isAuthorized({ "x-masthead-secret": "wrong" }, secret), false);
  assert.equal(isAuthorized({}, secret), false);
});

test("broker accepts only PR events with a delivery id", () => {
  const raw = JSON.stringify({
    eventType: "git.pullrequest.updated",
    notificationId: 42,
    resource: { pullRequestId: 7, repository: { id: "repo" } }
  });
  const event = parseEvent(raw);
  assert.equal(event.deliveryKey, "git.pullrequest.updated:42");
  assert.equal(buildQueueBody(event, "99").definition.id, 99);
});

test("broker rejects unsupported and malformed events", () => {
  assert.throws(
    () => parseEvent(JSON.stringify({ eventType: "build.complete", id: 1 })),
    /Unsupported/
  );
  assert.throws(() => parseEvent("not-json"), /valid JSON/);
});

test("broker builds the ADO queue URL without a trailing slash", () => {
  assert.equal(
    queueUrl("https://dev.azure.com/contoso/", "Sample Project"),
    "https://dev.azure.com/contoso/Sample%20Project/_apis/build/builds?api-version=7.1"
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  brokerBasicAuth,
  brokerServiceHookUrl,
  buildServiceHookSubscription,
  isMastheadServiceHook,
  nativeServiceHookUrl,
  SERVICE_HOOK_EVENTS
} from "../src/extension/shared/service-hooks";

const projectId = "11111111-2222-4333-8444-555555555555";

test("native service-hook URLs match the incoming-webhook endpoint", () => {
  const url = nativeServiceHookUrl("https://dev.azure.com/contoso/", "Masthead PR");
  assert.equal(
    url,
    "https://dev.azure.com/contoso/_apis/public/distributedtask/webhooks/Masthead%20PR?api-version=6.0-preview"
  );
  assert.throws(() => nativeServiceHookUrl("https://dev.azure.com/contoso", ""));
  assert.throws(() => nativeServiceHookUrl("http://contoso.example", "Masthead"));
});

test("broker service-hook URLs accept a base or an existing /event endpoint", () => {
  assert.equal(brokerServiceHookUrl("https://broker.example.com"), "https://broker.example.com/event");
  assert.equal(brokerServiceHookUrl("https://broker.example.com/masthead/"), "https://broker.example.com/masthead/event");
  assert.equal(brokerServiceHookUrl("https://broker.example.com/masthead/event"), "https://broker.example.com/masthead/event");
  assert.equal(brokerServiceHookUrl("http://127.0.0.1:8080"), "http://127.0.0.1:8080/event");
  assert.throws(() => brokerServiceHookUrl("https://broker.example.com?token=secret"));
  assert.throws(() => brokerServiceHookUrl("http://broker.example.com"));
});

test("service-hook subscriptions target one project and never embed credentials in the URL", () => {
  const subscription = buildServiceHookSubscription({
    projectId,
    eventType: "git.pullrequest.created",
    endpoint: {
      url: "https://broker.example.com/event",
      basicAuthCredentials: "masthead:01234567890123456789012345678901"
    }
  });
  assert.equal(subscription.publisherId, "tfs");
  assert.equal(subscription.eventType, "git.pullrequest.created");
  assert.equal(subscription.resourceVersion, "1.0");
  assert.equal(subscription.consumerId, "webHooks");
  assert.equal(subscription.consumerActionId, "httpRequest");
  assert.deepEqual(subscription.publisherInputs, {
    projectId,
    repository: "",
    branch: ""
  });
  assert.deepEqual(subscription.consumerInputs, {
    url: "https://broker.example.com/event",
    basicAuthCredentials: "masthead:01234567890123456789012345678901"
  });
  assert.ok(!JSON.stringify(subscription.consumerInputs).includes("?"));
  assert.throws(() => buildServiceHookSubscription({
    projectId: "not-a-project",
    eventType: "git.pullrequest.created",
    endpoint: { url: "https://broker.example.com/event" }
  }));
});

test("only subscriptions for the configured project and endpoint are matched", () => {
  const endpoint = "https://broker.example.com/event";
  const subscription = {
    consumerId: "webHooks",
    consumerActionId: "httpRequest",
    eventType: "git.pullrequest.updated",
    consumerInputs: { url: endpoint },
    publisherInputs: { projectId }
  };
  assert.equal(isMastheadServiceHook(subscription, projectId, endpoint), true);
  assert.equal(isMastheadServiceHook(subscription, projectId, "https://other.example.com/event"), false);
  assert.equal(isMastheadServiceHook(subscription, "22222222-3333-4444-8555-666666666666", endpoint), false);
  assert.equal(isMastheadServiceHook({ ...subscription, eventType: "git.push" }, projectId, endpoint), false);
  assert.equal(isMastheadServiceHook(null, projectId, endpoint), false);
});

test("broker credentials require one long line", () => {
  assert.equal(brokerBasicAuth("01234567890123456789012345678901"), "masthead:01234567890123456789012345678901");
  assert.throws(() => brokerBasicAuth("short"));
  assert.throws(() => brokerBasicAuth("01234567890123456789012345678901\nnext"));
});

test("the subscription event set covers PR creation, updates and comments", () => {
  assert.deepEqual([...SERVICE_HOOK_EVENTS], [
    "git.pullrequest.created",
    "git.pullrequest.updated",
    "ms.vss-code.git-pullrequest-comment-event"
  ]);
});

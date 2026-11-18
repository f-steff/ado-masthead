// The header connection chip must reflect a real Azure DevOps request, not the
// one-time iframe handshake. These tests cover the probe without a browser.
import assert from "node:assert/strict";
import test from "node:test";
import { checkHostConnection } from "../src/extension/shared/connectivity";

const organizationUrl = "https://dev.azure.com/contoso";

test("the host probe reports connected after an authorized project request", async () => {
  let requested = "";
  let headers: Record<string, string> = {};
  let cache = "";
  let redirect = "";
  const result = await checkHostConnection({
    organizationUrl: organizationUrl + "/",
    getToken: async () => "test-only-token",
    fetchImpl: async (url, init) => {
      requested = String(url);
      headers = init?.headers as Record<string, string>;
      cache = String(init?.cache);
      redirect = String(init?.redirect);
      assert.ok(init?.signal);
      return new Response("{}", { status: 200 });
    }
  });
  assert.equal(result.state, "connected");
  assert.equal(requested, `${organizationUrl}/_apis/projects?$top=1&api-version=7.1`);
  assert.equal(headers.authorization, "Bearer test-only-token");
  assert.equal(headers.accept, "application/json");
  assert.equal(cache, "no-store");
  assert.equal(redirect, "error");
  assert.ok(result.checkedAt instanceof Date);
});

test("HTTP and network failures report disconnected", async () => {
  for (const response of [
    new Response("", { status: 401 }),
    new Response("", { status: 503 })
  ]) {
    const result = await checkHostConnection({
      organizationUrl,
      getToken: async () => "test-only-token",
      fetchImpl: async () => response
    });
    assert.equal(result.state, "disconnected");
  }
  const thrown = await checkHostConnection({
    organizationUrl,
    getToken: async () => "test-only-token",
    fetchImpl: async () => { throw new Error("offline"); }
  });
  assert.equal(thrown.state, "disconnected");
});

test("a missing or failed token reports disconnected without a request", async () => {
  let called = false;
  const empty = await checkHostConnection({
    organizationUrl,
    getToken: async () => "   ",
    fetchImpl: async () => { called = true; return new Response("", { status: 200 }); }
  });
  assert.equal(empty.state, "disconnected");
  assert.equal(called, false);
  const rejected = await checkHostConnection({
    organizationUrl,
    getToken: async () => { throw new Error("no token"); },
    fetchImpl: async () => { called = true; return new Response("", { status: 200 }); }
  });
  assert.equal(rejected.state, "disconnected");
  assert.equal(called, false);
});

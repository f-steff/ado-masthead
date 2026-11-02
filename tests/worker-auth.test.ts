import assert from "node:assert/strict";
import test from "node:test";
import { resolveAdoAuth } from "../src/worker/auth";

test("a dedicated service identity takes precedence over the build-service token", () => {
  assert.deepEqual(resolveAdoAuth({
    MASTHEAD_ADO_TOKEN: "dedicated-test-token",
    SYSTEM_ACCESSTOKEN: "system-test-token"
  }), {
    token: "dedicated-test-token",
    scheme: "basic",
    source: "dedicated"
  });
  assert.deepEqual(resolveAdoAuth({ SYSTEM_ACCESSTOKEN: "system-test-token" }), {
    token: "system-test-token",
    scheme: "bearer",
    source: "system"
  });
  assert.deepEqual(resolveAdoAuth({ AZURE_DEVOPS_TOKEN: "local-test-token" }), {
    token: "local-test-token",
    scheme: "basic",
    source: "local"
  });
  assert.throws(() => resolveAdoAuth({}), /Set MASTHEAD_ADO_TOKEN/);
});

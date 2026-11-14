// Code search is advisory caller discovery. These tests pin the request shape
// and prove that only files from the reviewed repository are returned.
import assert from "node:assert/strict";
import test from "node:test";
import { AdoClient } from "../src";

const repositoryId = "22222222-2222-2222-2222-222222222222";

function client(fetchImpl: typeof fetch, organizationUrl = "https://dev.azure.com/contoso"): AdoClient {
  return new AdoClient({
    organizationUrl,
    project: "My Project",
    repositoryId,
    token: "test-only-token",
    tokenScheme: "bearer",
    fetchImpl
  });
}

test("code search sends bounded project and repository filters", async () => {
  let requested = "";
  let body: Record<string, unknown> = {};
  const paths = await client(async (url, init) => {
    requested = String(url);
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-only-token");
    return new Response(JSON.stringify({
      count: 3,
      results: [
        { path: "/src/caller.ts", repository: { id: repositoryId } },
        { path: "/src/other.ts", repository: { id: "33333333-3333-3333-3333-333333333333" } },
        { path: "/src/caller.ts", repository: { id: repositoryId } }
      ]
    }), { status: 200 });
  }).searchCodePaths("normalizeEmail", {
    projectName: "My Project",
    repositoryName: "StaticEmpty"
  });

  assert.equal(
    requested,
    "https://almsearch.dev.azure.com/contoso/My%20Project/_apis/search/codesearchresults?api-version=7.1"
  );
  assert.equal(body.searchText, "normalizeEmail");
  assert.deepEqual(body.filters, { Project: ["My Project"], Repository: ["StaticEmpty"] });
  assert.deepEqual(paths, ["src/caller.ts"]);
});

test("code search failures and unsupported deployments return no callers", async () => {
  const denied = client(async () => new Response("", { status: 403 }));
  assert.deepEqual(await denied.searchCodePaths("normalizeEmail", {
    projectName: "My Project",
    repositoryName: "StaticEmpty"
  }), []);

  const onPremises = client(async () => {
    throw new Error("must not be called");
  }, "https://ado.contoso.local/tfs/DefaultCollection");
  assert.deepEqual(await onPremises.searchCodePaths("normalizeEmail", {
    projectName: "My Project",
    repositoryName: "StaticEmpty"
  }), []);
});

test("code search refuses unsafe search text", async () => {
  const search = client(async () => {
    throw new Error("must not be called");
  });
  for (const value of ["", "two words", "a", "name; rm -rf /", "x".repeat(80)]) {
    assert.deepEqual(await search.searchCodePaths(value, {
      projectName: "My Project",
      repositoryName: "StaticEmpty"
    }), []);
  }
});

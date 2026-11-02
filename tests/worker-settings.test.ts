// The pipeline gate must read the same settings documents as the settings UI.
// These tests use a fake REST endpoint and never contact Azure DevOps.
import assert from "node:assert/strict";
import test from "node:test";
import {
  loadReviewSettings,
  readExtensionSetting,
  reviewGate,
  SettingsAccessError,
  writeExtensionSetting
} from "../src/worker/settings";
import {
  defaultOrganizationSettings,
  defaultProjectSettings,
  seedRepositories
} from "../src/settings";

const organizationUrl = "https://dev.azure.com/contoso";
const projectId = "11111111-1111-1111-1111-111111111111";
const repositoryId = "22222222-2222-2222-2222-222222222222";

function options(fetchImpl: typeof fetch) {
  return {
    organizationUrl,
    token: "test-only-token",
    tokenScheme: "bearer" as const,
    publisher: "f-steff",
    extensionId: "masthead-dev",
    projectId,
    repositoryId,
    fetchImpl
  };
}

test("extension settings use the collection-scoped documents endpoint", async () => {
  let requested = "";
  const value = await readExtensionSetting(options(async (url, init) => {
    requested = String(url);
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-only-token");
    return new Response(JSON.stringify({ id: "organization", value: { enabled: false } }), { status: 200 });
  }), "organization");
  assert.deepEqual(value, { enabled: false });
  assert.equal(
    requested,
    `https://extmgmt.dev.azure.com/contoso/_apis/ExtensionManagement/InstalledExtensions/f-steff/masthead-dev/` +
      "Data/Scopes/Default/Current/Collections/%24settings/Documents/organization?api-version=6.0-preview.1"
  );
});

test("model metadata can be written back to the same settings document", async () => {
  let method = "";
  let body: Record<string, unknown> = {};
  await writeExtensionSetting(options(async (_url, init) => {
    method = init?.method ?? "";
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response("{}", { status: 200 });
  }), "modelCatalog", { deepseek: { models: ["deepseek-chat"] } });
  assert.equal(method, "PUT");
  assert.equal(body.id, "modelCatalog");
  assert.deepEqual(body.value, { deepseek: { models: ["deepseek-chat"] } });
  assert.equal(body.__etag, -1);
});

test("a missing settings document is distinct from an access failure", async () => {
  assert.equal(await readExtensionSetting(options(async () => new Response("", { status: 404 })), "organization"), undefined);
  await assert.rejects(
    () => readExtensionSetting(options(async () => new Response("", { status: 403 })), "organization"),
    (error: unknown) => error instanceof SettingsAccessError && /not readable/.test(error.message)
  );
  await assert.rejects(
    () => readExtensionSetting(options(async () => new Response("", { status: 500 })), "organization"),
    /HTTP 500/
  );
});

test("the pipeline gate follows organization, project and destination repository switches", async () => {
  const organization = { ...defaultOrganizationSettings(), enabled: true };
  const project = seedRepositories(defaultProjectSettings(), [repositoryId], true);
  const snapshot = JSON.stringify({ organization, project });
  const settings = await loadReviewSettings({
    ...options(async () => new Response("", { status: 500 })),
    snapshot
  });
  assert.equal(settings.source, "snapshot");
  assert.equal(reviewGate(settings), true);

  assert.equal(reviewGate(await loadReviewSettings({
    ...options(async () => new Response("", { status: 500 })),
    snapshot: JSON.stringify({ organization: { ...organization, enabled: false }, project })
  })), false);
  assert.equal(reviewGate(await loadReviewSettings({
    ...options(async () => new Response("", { status: 500 })),
    snapshot: JSON.stringify({ organization, project: { ...project, enabled: false } })
  })), false);
  assert.equal(reviewGate(await loadReviewSettings({
    ...options(async () => new Response("", { status: 500 })),
    snapshot: JSON.stringify({ organization, project: { ...project, repositories: {} } })
  })), false);
});

test("a missing repository is disabled, while an absent project follows the organization default", async () => {
  const organization = { ...defaultOrganizationSettings(), enabled: true, defaultProjectEnabled: false };
  const settings = await loadReviewSettings({
    ...options(async (url) => {
      if (String(url).includes("/Documents/organization")) {
        return new Response(JSON.stringify({ value: organization }), { status: 200 });
      }
      return new Response("", { status: 404 });
    }),
    projectId,
    repositoryId
  });
  assert.equal(settings.project.enabled, false);
  assert.equal(reviewGate(settings), false);

  const defaultOn = await loadReviewSettings({
    ...options(async (url) => {
      if (String(url).includes("/Documents/organization")) {
        return new Response(JSON.stringify({
          value: { ...defaultOrganizationSettings(), defaultRepositoryEnabled: true }
        }), { status: 200 });
      }
      return new Response("", { status: 404 });
    }),
    projectId,
    repositoryId
  });
  assert.equal(reviewGate(defaultOn), true);
});

test("settings auto-detect one configured edition and reject ambiguous editions", async () => {
  const base = options(async (url) => {
    if (String(url).includes("/masthead-dev/") && String(url).includes("/Documents/organization")) {
      return new Response(JSON.stringify({ value: { ...defaultOrganizationSettings(), defaultRepositoryEnabled: true } }), { status: 200 });
    }
    if (String(url).includes("/masthead/") && String(url).includes("/Documents/organization")) {
      // The management service returns 500 rather than 404 when an edition is absent.
      return new Response("", { status: 500 });
    }
    return new Response("", { status: 404 });
  });
  const auto = { ...base, extensionId: undefined };
  const selected = await loadReviewSettings(auto);
  assert.equal(selected.source, "extension-data");
  assert.equal(selected.extensionId, "masthead-dev");
  assert.equal(reviewGate(selected), true);

  const both = await loadReviewSettings({
    ...auto,
    fetchImpl: async (url) => String(url).includes("/Documents/organization")
      ? new Response(JSON.stringify({ value: defaultOrganizationSettings() }), { status: 200 })
      : new Response("", { status: 404 })
  }).catch((error: unknown) => error);
  assert.ok(both instanceof Error && /Both Masthead editions/.test(both.message));

  const none = await loadReviewSettings({
    ...auto,
    fetchImpl: async () => new Response("", { status: 500 })
  });
  assert.equal(none.source, "defaults");
  assert.equal(reviewGate(none), false);

  await assert.rejects(
    () => loadReviewSettings({
      ...auto,
      fetchImpl: async (url) => String(url).includes("/masthead-dev/")
        ? new Response("", { status: 403 })
        : new Response("", { status: 500 })
    }),
    /not readable/
  );
});

test("snapshot parsing rejects malformed data instead of opening the gate", async () => {
  for (const value of ["not json", "[]", "null", '"text"']) {
    await assert.rejects(
      () => loadReviewSettings({ ...options(async () => new Response("", { status: 500 })), snapshot: value }),
      /MASTHEAD_SETTINGS_JSON/
    );
  }
  const blank = await loadReviewSettings({
    ...options(async () => new Response("", { status: 500 })),
    snapshot: "{}"
  });
  assert.equal(blank.source, "snapshot");
  assert.equal(reviewGate(blank), false);
});

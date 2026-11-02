import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  REVIEW_LENSES,
  REVIEW_LENS_BY_ID,
  applyRepositoryLicenseWarning,
  buildProviderRequest,
  buildReviewPrompt,
  defaultReviewProfile,
  detectRepositoryLicense,
  lensesInPrompt,
  parseReviewResult,
  providerFromEnvironment,
  resolveReviewProfile,
  suggestedLensesForPaths
} from "../src";

interface Fixture {
  id: string;
  lens: string;
  title: string;
  changedFiles: Array<{
    path: string;
    changeType: "add" | "edit" | "delete" | "rename";
    diff?: string;
    content?: string;
  }>;
  repositoryLicense?: { path?: string; text?: string; missing: boolean; warning?: string };
  context?: string;
  expected: { mustFind: string[]; mustNotFind: string[] };
}

const fixturesPath = path.join(process.cwd(), "tests", "fixtures", "review-cases.json");
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8")) as Fixture[];

test("the default profile includes the agreed lenses", () => {
  const profile = defaultReviewProfile();
  assert.deepEqual(profile.enabledLenses, [
    "correctness",
    "security",
    "tests",
    "license"
  ]);
  assert.equal(profile.reviewGuide, true);
});

test("correctness is mandatory even when omitted", () => {
  const profile = resolveReviewProfile({ enabledLenses: ["license"], reviewGuide: false });
  assert.equal(profile.enabledLenses.includes("correctness"), true);
  assert.equal(profile.enabledLenses.includes("license"), true);
  assert.equal(profile.reviewGuide, false);
});

test("unknown lenses are rejected", () => {
  assert.throws(
    () => resolveReviewProfile({ enabledLenses: ["made-up" as never] }),
    /Unknown review lens/
  );
});

test("all declared lenses are unique", () => {
  const ids = new Set(REVIEW_LENSES.map((lens) => lens.id));
  assert.equal(ids.size, REVIEW_LENSES.length);
});

test("relevant paths suggest opt-in lenses without enabling them by default", () => {
  assert.deepEqual(suggestedLensesForPaths(["migrations/001.sql"]), ["data"]);
  assert.deepEqual(suggestedLensesForPaths(["package-lock.json"]), ["dependencies"]);
  assert.deepEqual(suggestedLensesForPaths(["src/app.ts"]), []);
});

test("the prompt contains selected lenses and excludes opt-in lenses by default", () => {
  const prompt = buildReviewPrompt({
    title: "Add profile email",
    changedFiles: [{ path: "src/user.ts", changeType: "edit", diff: "+user.profile.email" }]
  });
  const ids = lensesInPrompt(prompt);
  assert.deepEqual(ids, ["correctness", "security", "tests", "license"]);
  assert.equal(prompt.system.includes("untrusted data"), true);
  assert.equal(prompt.system.includes("Output contract"), true);
  assert.match(prompt.system, /review guide/i);
});

test("selecting an opt-in lens adds it to the prompt", () => {
  const prompt = buildReviewPrompt(
    {
      title: "Optimize query",
      changedFiles: [{ path: "src/orders.ts", changeType: "edit", diff: "+await load(order)" }]
    },
    { enabledLenses: ["correctness", "performance"], reviewGuide: false }
  );
  assert.equal(prompt.system.includes("Performance and scalability"), true);
  assert.doesNotMatch(prompt.system, /review guide/i);
});

test("a missing root license becomes one explicit repository warning", () => {
  const license = detectRepositoryLicense({ "src/app.ts": "export const x = 1;" });
  assert.equal(license.missing, true);
  assert.match(license.warning ?? "", /root LICENSE/);
});

test("manifest metadata does not replace a missing LICENSE file", () => {
  const license = detectRepositoryLicense({
    "package.json": JSON.stringify({ license: "MIT" })
  });
  assert.equal(license.missing, true);
});

test("common root license filenames are accepted", () => {
  const license = detectRepositoryLicense({
    "LICENSE.md": "MIT License",
    "src/app.ts": "export const x = 1;"
  });
  assert.equal(license.missing, false);
  assert.equal(license.path, "LICENSE.md");
});

test("the license lens requires policy evidence, not a legal conclusion", () => {
  const prompt = buildReviewPrompt({
    title: "Add a vendored file",
    changedFiles: [{ path: "vendor/file.ts", changeType: "add", content: "content" }]
  });
  assert.match(prompt.system, /never/i);
  assert.match(prompt.system, /policy conflicts/i);
  assert.match(prompt.system, /definitive legal conclusions/i);
});

test("the prompt marks a missing license as one repository-level warning", () => {
  const prompt = buildReviewPrompt({
    title: "Add vendored file",
    changedFiles: [{ path: "vendor/file.ts", changeType: "add", content: "content" }],
    repositoryLicense: detectRepositoryLicense({ "src/app.ts": "export const x = 1;" })
  });
  assert.match(prompt.system, /No root LICENSE file/);
  assert.match(prompt.system, /warning must not be repeated for every file/);
});

test("a missing license produces exactly one deterministic warning", () => {
  const license = detectRepositoryLicense({ "src/app.ts": "export const x = 1;" });
  const first = applyRepositoryLicenseWarning({ summary: "clean", findings: [] }, license);
  const second = applyRepositoryLicenseWarning(first, license);
  assert.equal(first.findings.length, 1);
  assert.equal(first.findings[0].id, "repository-license-missing");
  assert.equal(first.findings[0].severity, "warning");
  assert.equal(second.findings.length, 1);
});

test("structured review output is parsed and validated", () => {
  const result = parseReviewResult(
    JSON.stringify({
      summary: "One issue.",
      findings: [
        {
          id: "f1",
          lens: "correctness",
          severity: "major",
          confidence: "high",
          file: "src/user.ts",
          line: 12,
          title: "Missing null check",
          body: "The profile can be undefined.",
          suggestion: "Use optional chaining."
        }
      ]
    })
  );
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].line, 12);
});

test("invalid structured output fails instead of becoming an empty review", () => {
  assert.throws(
    () => parseReviewResult("{\"summary\":\"x\",\"findings\":[{\"severity\":\"bad\"}]}"),
    /invalid severity|missing/
  );
});

test("each review lens has at least one positive and one negative fixture", () => {
  for (const lens of REVIEW_LENSES) {
    const cases = fixtures.filter((fixture) => fixture.lens === lens.id);
    assert.ok(cases.length >= 2, `${lens.id} needs at least two cases`);
    assert.ok(
      cases.some((fixture) => fixture.expected.mustFind.length > 0),
      `${lens.id} needs a positive case`
    );
    assert.ok(
      cases.some((fixture) => fixture.expected.mustFind.length === 0),
      `${lens.id} needs a negative case`
    );
  }
});

test("Anthropic request construction uses its native message shape", () => {
  const request = buildProviderRequest(
    {
      name: "anthropic",
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "https://example.test/"
    },
    { system: "system", user: "user" }
  );
  assert.equal(request.url, "https://example.test/v1/messages");
  assert.equal(request.headers["x-api-key"], "test-key");
  assert.equal(request.headers["anthropic-version"], "2023-06-01");
  assert.equal(Array.isArray(request.body.messages), true);
});

test("OpenAI-compatible providers use chat completions", () => {
  const openai = buildProviderRequest(
    { name: "openai", apiKey: "test-key", model: "test-model" },
    { system: "system", user: "user" }
  );
  const deepseek = buildProviderRequest(
    { name: "deepseek", apiKey: "test-key", model: "test-model" },
    { system: "system", user: "user" }
  );
  assert.equal(openai.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(deepseek.url, "https://api.deepseek.com/v1/chat/completions");
  assert.match(String(openai.headers.authorization), /^Bearer /);
});

test("provider configuration reads keys only from the selected provider", () => {
  const config = {
    ANTHROPIC_API_KEY: "anthropic-key",
    OPENAI_API_KEY: "openai-key",
    DEEPSEEK_API_KEY: "deepseek-key",
    MASTHEAD_PROVIDER: "anthropic",
    MASTHEAD_MODEL: "test-model"
  } as unknown as NodeJS.ProcessEnv;
  const provider = providerFromEnvironment(config);
  assert.equal(provider.name, "anthropic");
  assert.equal(provider.apiKey, "anthropic-key");
  assert.equal(provider.model, "test-model");
});

test("provider configuration fails clearly without a selected key", () => {
  assert.throws(
    () =>
      providerFromEnvironment({
        MASTHEAD_PROVIDER: "deepseek",
        MASTHEAD_MODEL: "test-model"
      } as unknown as NodeJS.ProcessEnv),
    /DEEPSEEK_API_KEY/
  );
});

test("every fixture names a real lens and has a distinct id", () => {
  const ids = new Set<string>();
  for (const fixture of fixtures) {
    assert.ok(REVIEW_LENS_BY_ID.has(fixture.lens as never), fixture.id);
    assert.equal(ids.has(fixture.id), false, fixture.id);
    ids.add(fixture.id);
  }
});

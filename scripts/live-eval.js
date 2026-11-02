// Optional local evaluation against a real provider. This is intentionally not
// part of npm test: CI must stay offline and must not spend money or require keys.
const fs = require("fs");
const path = require("path");

/** Run only an explicitly selected synthetic case against an explicitly selected provider. */
async function main() {
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", "review-cases.json");
  const fixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const caseId = process.argv[2];
  if (!caseId) {
    console.error("Usage: MASTHEAD_PROVIDER=... MASTHEAD_MODEL=... npm run eval:live -- <case-id>");
    console.error(`Cases: ${fixtures.map((fixture) => fixture.id).join(", ")}`);
    process.exit(1);
  }

  const fixture = fixtures.find((item) => item.id === caseId);
  if (!fixture) {
    console.error(`Unknown case: ${caseId}`);
    process.exit(1);
  }

  const { runReview, complete, providerFromEnvironment } = await import(
    "../dist/core/index.mjs"
  );
  const provider = providerFromEnvironment();
  const started = performance.now();
  const run = await runReview(
    {
      title: fixture.title,
      changedFiles: fixture.changedFiles,
      context: fixture.context,
      repositoryLicense: fixture.repositoryLicense
    },
    { enabledLenses: [fixture.lens, "correctness"], reviewGuide: false },
    (prompt, signal) => complete(provider, prompt, fetch, signal)
  );
  const result = run.result;
  console.log(`Provider: ${provider.name}`);
  console.log(`Model: ${provider.model}`);
  console.log(`Case: ${caseId}`);
  console.log(`Duration: ${Math.round(performance.now() - started)} ms`);
  console.log(`Suppressed findings: ${run.suppressedCount}`);
  console.log(`Summary: ${result.summary}`);
  console.log(JSON.stringify(result.findings, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

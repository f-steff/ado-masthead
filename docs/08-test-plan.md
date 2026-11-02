# 08 - Test plan

## Deterministic suite

`npm test` needs no external network or model key. Broker HTTP tests use an
ephemeral loopback port with a fake ADO response; no real organization is
contacted. The suite checks:

- default and mandatory lens selection;
- unknown lens rejection;
- path-based lens suggestions;
- prompt composition and output contract;
- missing-LICENSE behavior;
- structured output validation;
- fixture coverage for every lens;
- default-off repository discovery and profile editing;
- trusted prompt/data separation and actual repository license context;
- output path, lens, line, guide and duplicate-ID validation;
- disabled licensing, input budgets, noise limits and cancellation;
- provider protocols, sanitized errors and truncated responses;
- explicit fix verification, human decisions, regressions and stale revisions;
- PR events, author replies, own-comment loops and repeated comment revisions;
- nested comment payloads and retryable broker queue failures.

## Repository and release checks

`tests/repository.test.mjs` runs in the same offline suite. It checks:

- dev/stable version sequencing, including empty repositories and invalid inputs;
- edition IDs, publisher, listing text and packaged LICENSE;
- credential-free packaging and credential-required publishing;
- sharing argument handling and private organization input protection;
- every local quality gate in the required CI job;
- the actual release-source workflow code for feature, release and fork PRs;
- explicit publishing opt-in, branch restrictions and OIDC authentication.

For packaging changes, run the full local gate followed by `package:stable`
and `package:dev`. Confirm that both VSIX files exclude `.opencode/`, tests,
credentials and dependencies, and include the core, informational page and
LICENSE. GitHub runs cannot be verified until the initial feature branch is
pushed; Marketplace publication is deliberately disabled.

Bootstrap validation (2026-10-31): main and develop were created from the same
LICENSE-only commit; matching branch protections and repository settings were
applied. Feature work and workflow files remain local.

Local release-scaffold validation: typecheck, lint, the full offline suite,
identifier scan, production build and both VSIX packages pass. Workflow files
also pass actionlint 1.7.12. Both archives include LICENSE and exclude local
browser configuration, tests, node_modules and git metadata. No publish, model
evaluation, GitHub Actions run or ADO installation was performed in this step.

## Fixture catalogue

| Lens | Positive | Negative |
| --- | --- | --- |
| Correctness | `correctness-null-profile` | `correctness-negative-rename` |
| Security | `security-sql-concatenation` | `security-negative-safe-parameter` |
| Tests | `tests-missing-edge-case` | `tests-negative-rename` |
| License | `license-missing-root-license`, `license-gpl-file-in-mit-repository` | `license-negative-mit-compatible`, `license-negative-spdx-test-data` |
| Performance | `performance-n-plus-one` | `performance-negative-small-loop` |
| Maintainability | `maintainability-duplicated-logic` | `maintainability-negative-formatting` |
| Data | `data-destructive-migration` | `data-negative-additive-column` |
| Dependencies | `dependencies-untrusted-install` | `dependencies-negative-lockfile-refresh` |

The fixtures are in `tests/fixtures/review-cases.json`. Assertions should be
semantic: expected issue class, file, approximate line and absence of listed
false positives. Do not assert exact model prose.

Every fixture runs through the real local worker with a deterministic model
substitute. This tests orchestration and output handling, not whether an LLM
discovers the intended bug. Live prompt-quality evaluation remains separate.
Fixture PR titles do not reveal the issue the model is expected to discover.

## Live model evaluation

`npm run eval:live -- <case-id>` runs the selected fixture against the provider
configured by `MASTHEAD_PROVIDER` and `MASTHEAD_MODEL`. It uses the real network
and is never part of CI. It prints a validated response, elapsed time and
suppression count for manual assessment. Automated semantic grading and cost
estimation are not yet implemented; fixture metadata is not evidence that a
model passed a case.

Assess expected concepts and unwanted findings against the fixture catalogue.
Live results are evidence for prompt tuning, not a CI gate. Do not mistake
missing context for evidence that notices or attribution do not exist.

## Local worker validation (2026-10-31)

The expanded suite has 81 passing tests, including loopback HTTP integration,
all-lens worker fixtures, conversation replies and reconciliation policy.
Typecheck, lint, identifier checks, production build and both VSIX packages
pass. The dependency audit reports no known vulnerabilities.

Two bounded DeepSeek smoke checks used synthetic data: the GPL-header/MIT case
produced a license review finding, and the parameterized SQL case produced no
findings. These are narrow observations, not a prompt-quality certification or
an end-to-end ADO test. No feature branch was pushed and no ADO settings were
changed.

## ADO integration tests (postponed)

When browser and ADO credentials are available:

1. Install the private extension in a test organization.
2. Connect two projects and verify per-project gating.
3. Open, update and comment on PRs in a repository with no application pipeline.
4. Verify cross-project event delivery, duplicate delivery and stale-run cancellation.
5. Verify branch-policy status behavior independently from review eligibility.
6. Uninstall and verify hook and pipeline cleanup guidance.

## Browser tests (postponed)

Use the dedicated debug Chrome profile and only tabs opened for Masthead. Test
the PR tab and settings pages. Close those tabs when finished and never touch
unrelated tabs.

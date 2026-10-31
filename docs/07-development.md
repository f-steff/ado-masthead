# 07 - Development

## Layout

| Path | Purpose |
| --- | --- |
| `src/review/` | Lens catalogue, prompt builder, license rule and result parser. |
| `src/providers/` | Anthropic, OpenAI and DeepSeek HTTP adapters. |
| `src/settings/` | Organization, project and repository gating model. |
| `broker/` | Optional Docker event receiver and its tests. |
| `src/extension/` | Extension settings and PR-tab surfaces (next slice). |
| `src/worker/` | Validated local review execution and PR-event decision policy. |
| `tests/` | Deterministic unit tests and review fixtures. |
| `scripts/` | Build and test entry points. |
| `ci/` | Repository checks used by the local gate and CI. |
| `.github/workflows/` | CI, release guard, OIDC publication and dev sharing. |
| `ado-manifests/` | Shared extension manifest and dev/stable identity overrides. |
| `docs/` | Engineering documentation. |
| `README.md` | User-facing documentation. |

## Commands

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run test:broker
npm run build:dev
npm run build:prod
npm run verify:clean
npm run package:dev
npm run package:stable
```

The test runner bundles TypeScript with esbuild and runs Node's test runner.
The generated review core is written to `dist/core/`.

The informational organization-settings page is copied to `dist/extension/`.
VSIX packages currently validate the release scaffold; they do not deploy a
review service or add working PR-review controls.

## Branching

The only long-lived branches are `main` and `develop`:

```text
feature/* -> develop -> main
```

Use rebase merge for feature PRs into `develop`. Use a merge commit for release
PRs from `develop` into `main`; rebasing a release rewrites ancestry and causes
the branches to diverge. Squash merging is disabled. GitHub deletes a feature
branch after its PR merges.

Both long-lived branches require pull requests and up-to-date `build` and
`release-source` checks. Force pushes and branch deletion are blocked, with no
bypass actors. The release-source workflow rejects direct feature releases and
fork branches named `develop`.

The initial feature branch is `feature/initial-implementation`. Keep it local
until explicitly asked to push. The remote bootstrap contains only LICENSE on
both long-lived branches; CI files become available when the feature work is
pushed and proposed through a PR.

## Local gate

Run the complete gate before considering a change complete:

```sh
npm run typecheck && npm run lint && npm test && npm run verify:clean && npm run build:prod
```

`npm run verify:clean` rejects machine paths, private-key material and common
token shapes. It skips `.opencode/`, which is local browser configuration.

Run `npm run package:stable` and `npm run package:dev` after the production
build when changing manifests or release tooling. Neither command publishes or
requires credentials. Generated manifests and VSIX files are ignored by git.

## Model tests

The default test suite must not use the network or a model key. Live provider
checks are a separate, opt-in command and must never be part of the required
gate. The environment keys are only inputs to that optional command.

After `npm run build:dev`, select a provider and model explicitly:

```sh
MASTHEAD_PROVIDER=anthropic MASTHEAD_MODEL=<model> npm run eval:live -- correctness-null-profile
```

The command reads the selected fixture, builds the prompt, calls the provider
through the same worker as the unit tests, and prints the validated result.
It never logs the API key. Findings and model responses are not written to git.

Provider options include `MASTHEAD_MAX_TOKENS` (default 4096),
`MASTHEAD_TIMEOUT_MS` (default 60000), and optional `MASTHEAD_TEMPERATURE`.
Temperature is omitted unless configured. Modern OpenAI chat models use
`max_completion_tokens`; DeepSeek uses `max_tokens` and Anthropic uses its
native Messages API. Live compatibility still needs testing per model.

## Development sequence

1. Review engine and prompts.
2. Fixture evaluation and license lens.
3. Settings UI and project gating.
4. PR tab and publisher.
5. Broker and central pipeline.
6. ADO integration and browser tests.
7. Publishing and release checks.

The first three steps do not require GitHub or ADO credentials.

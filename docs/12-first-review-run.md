# 12 - First review run

This document describes the first working review path. It reads one Azure
DevOps pull request, runs the validated review worker, and publishes findings as
pull request threads. It is intentionally manual or pipeline-invoked; automatic
service-hook delivery comes next.

## What it does

- Reads the pull request's fixed source and target commits.
- Reads changed file content from the source commit.
- Reads the target repository's root `LICENSE` file, if one exists.
- Reads prior Masthead thread metadata so retries do not duplicate findings.
- Calls the selected provider through the existing review boundary.
- Posts substantive findings as inline threads; repository-level warnings are
  posted without an anchor.
- Records finding identity in a versioned hidden marker, accepted only from the
  authenticated pipeline identity.

The first run on a repository without a root `LICENSE` produces one
repository-level warning in addition to any code findings. A second run reuses
the existing Masthead threads.

## Prerequisites

- The reviewed repository is readable by the pipeline identity.
- The pipeline identity can contribute to pull request threads.
- The provider key is a secret variable or a variable group linked only to the
  review pipeline.
- `System.AccessToken` is available to the review step.

No provider key is sent to the extension hub, a PR comment or a command line
argument.

## Pipeline variables

| Variable | Purpose |
| --- | --- |
| `AZURE_DEVOPS_ORG_URL` | Organization URL without a project path. |
| `MASTHEAD_PROJECT` | Project containing the reviewed repository. |
| `MASTHEAD_PROJECT_ID` | Optional project id fallback when the PR response omits it. |
| `MASTHEAD_REPOSITORY` | Repository ID or name. |
| `MASTHEAD_PULL_REQUEST_ID` | Pull request number. |
| `MASTHEAD_PROVIDER` | `anthropic`, `openai` or `deepseek`; a settings override takes precedence. |
| `MASTHEAD_MODEL` | Provider model name; a settings override takes precedence. |
| `MASTHEAD_MAX_TOKENS` | Optional output budget. |
| `MASTHEAD_TIMEOUT_MS` | Optional provider timeout. |
| `MASTHEAD_EXTENSION_ID` | Installed extension id, for example `masthead-dev`. Required unless a settings snapshot is supplied. |
| `MASTHEAD_EXTENSION_PUBLISHER` | Optional publisher id; defaults to `f-steff`. |
| `MASTHEAD_SETTINGS_JSON` | Optional controlled settings snapshot for local or isolated tests. |
| `MASTHEAD_ADO_TOKEN` | Optional dedicated service-identity PAT. It takes precedence over the build-service token. |
| `SYSTEM_ACCESSTOKEN` | Pipeline identity token when no dedicated identity is configured. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` | The selected provider secret. |

The provider key variables must remain secret variables or be mapped from a
secret variable group. The other names are ordinary pipeline configuration.

The worker reads the organization document and the document for the PR's
destination project before it configures a provider. The organization, project
and repository switches are therefore effective before any model tokens are
spent. The project id comes from the PR's destination repository; a fork or
cross-project PR is gated by the repository that receives the merge.

The pipeline identity must be able to read the extension's data documents. If
that is not available in the hosting organization, supply the same shape through
`MASTHEAD_SETTINGS_JSON` for a controlled run:

```json
{ "organization": { "...": "..." }, "project": { "...": "..." } }
```

The settings page still owns the persisted documents. A snapshot is a deliberate
deployment input, not a second editable settings store.

## Pipeline step

The repository must be built before this step:

```yaml
- script: |
    npm ci
    npm run build:prod
    node dist/worker/review-pr.mjs
  displayName: Masthead review
  env:
    AZURE_DEVOPS_ORG_URL: $(System.CollectionUri)
    MASTHEAD_PROJECT: $(System.TeamProject)
    MASTHEAD_REPOSITORY: $(Build.Repository.ID)
    MASTHEAD_PULL_REQUEST_ID: $(System.PullRequest.PullRequestId)
    MASTHEAD_PROVIDER: $(MASTHEAD_PROVIDER)
    MASTHEAD_MODEL: $(MASTHEAD_MODEL)
    MASTHEAD_EXTENSION_ID: $(MASTHEAD_EXTENSION_ID)
    MASTHEAD_EXTENSION_PUBLISHER: $(MASTHEAD_EXTENSION_PUBLISHER)
    MASTHEAD_ADO_TOKEN: $(MASTHEAD_ADO_TOKEN)
    SYSTEM_ACCESSTOKEN: $(System.AccessToken)
    ANTHROPIC_API_KEY: $(ANTHROPIC_API_KEY)
```

`MASTHEAD_ADO_TOKEN` is optional. When it is set, the worker uses that identity
for settings reads and pull request comments, so a dedicated service account can
appear as the review author. Keep it in the secret variable group. The default
build-service identity cannot be renamed by the extension.

Use the provider key variable that matches `MASTHEAD_PROVIDER`. Do not echo the
environment or enable command tracing in this step.

## Local manual run

Use a short-lived PAT in a local shell only when testing. Never commit it.

```powershell
npm run build:prod
$env:AZURE_DEVOPS_ORG_URL = "https://dev.azure.com/contoso"
$env:MASTHEAD_PROJECT = "SampleProject"
$env:MASTHEAD_REPOSITORY = "00000000-0000-0000-0000-000000000000"
$env:MASTHEAD_PULL_REQUEST_ID = "<number>"
$env:MASTHEAD_PROVIDER = "anthropic"
$env:MASTHEAD_MODEL = "<model>"
$env:ANTHROPIC_API_KEY = "<provider-key>"
$env:AZURE_DEVOPS_TOKEN = "<short-lived-pat>"
node dist/worker/review-pr.mjs
```

The process prints only a summary, finding count and publication result. It does
not print the provider key, ADO token, prompt or raw repository content.

## Current limits

- There is no service-hook trigger yet; the step must be run manually or by a
  pipeline.
- The runner reads full changed-file content rather than a minimal diff.
- Related unchanged files, callers and tests are not retrieved yet.
- A re-review does not resolve a finding merely because the model omitted it.
  A separate verification pass must return an evidence-backed `fixed` or
  `withdrawn` result. The current verifier sees changed-file content only; a
  finding whose evidence is not in that content stays open as `unverified`.
- Related unchanged files are not retrieved for the verifier yet.
- The organization, project and repository switches are read and enforced by
  the worker. A repository with no stored switch follows the configured
  new-repository default.
- The PR tab, review guide publication, event-service deployment and automated
  central-pipeline creation are not connected.
- Settings reads depend on the pipeline identity's access to extension data.
  Use a dedicated token or an explicit settings snapshot when that access is
  not available.
- The pipeline step should not have source-branch write permission.

## Expected first-run result

For a changed file with an unguarded optional value, the review can create an
inline finding thread at the reported line. The thread body names the trigger,
consequence and suggested fix. A repository without a root `LICENSE` also gets
one general thread warning.

The publisher is idempotent for retries: if the review is run again with the
same findings, it skips the existing Masthead threads instead of adding
duplicates.

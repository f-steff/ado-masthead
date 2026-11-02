# Masthead - AI pull request reviews for Azure DevOps

Masthead reviews pull requests in Azure Repos without requiring changes to each
application pipeline. It reads the change in the context of the surrounding
code, posts findings on the PR, maintains its previous findings across new
commits, and answers questions in its review threads.

Masthead is in active development. The dev package is available to shared
organizations; the public stable release is still being prepared.

The current implementation includes the validated review core, provider
adapters, SDK-initialized organization and project settings hubs, and a
manual/pipeline review path that reads a pull request, posts findings as ADO
threads and reuses existing Masthead threads on retry. The organization page
has a master switch, delivery mode and central-pipeline validation. The project
page discovers repositories and stores per-repository review gates.

Automatic PR-event delivery, central-pipeline creation, the worker's use of the
persisted gates, and the PR tab are still being built. The features below
describe the intended complete product.

Local tests exercise review validation, repository gating, finding
reconciliation, ADO publication and the broker's HTTP delivery/retry handling.
These do not replace installation or end-to-end testing against Azure DevOps.

## What it does

- Starts a review when a pull request is created or updated.
- Reviews across repositories and projects selected during onboarding.
- Reads related files, callers and tests, not just the changed diff.
- Posts inline findings and a summary on the pull request.
- Adds a **Masthead** tab to the pull request with a review guide, coverage,
  and the current findings.
- Answers author comments in its own review threads.
- Rechecks previous findings after a new push and resolves the ones that are
  actually fixed.
- Uses provider keys stored as Azure DevOps secrets.

Application pipelines are not modified. Masthead listens to pull request
events and queues its own centrally managed review pipeline.

Masthead supports two deployment paths:

- **Native**: Azure DevOps Incoming Webhooks queue Masthead's own pipeline.
  Nothing is hosted outside Azure DevOps.
- **Broker**: an optional Docker image receives authenticated PR events and
  queues the same pipeline. This is the safer option when the public incoming
  webhook endpoint is not acceptable.

The organization settings page provides the setup action for the chosen mode.
Each project settings page lists its repositories and lets an administrator
enable or disable PR reviews per repository.

## Review types

| Type | Default | Focus |
| --- | --- | --- |
| Correctness and impact | Always on | Bugs, changed behavior, affected callers and contracts. |
| Security and privacy | On | Injection, authorization, secrets and unsafe data handling. |
| Tests and verification | On | Whether behavior changes are meaningfully tested. |
| License and provenance | On, optional | Licenses, copied files, notices and missing provenance. |
| Performance and scalability | Off | Work that is wasteful or scales poorly. |
| Maintainability | Off | Material complexity and duplication. |
| Data and migration safety | Off, path-suggested | Destructive or unsafe schema and data changes. |
| Dependencies and infrastructure | Off, path-suggested | Packages, build steps and infrastructure changes. |

A project can select which optional types apply to its repositories. Path
suggestions only recommend a type; they do not silently enable it.

## License review

The license lens checks the code being reviewed, not Masthead itself.

- The target repository's policy is read from its root `LICENSE`.
- A missing license produces one repository-level warning.
- Package metadata alone does not replace a missing `LICENSE`.
- The lens looks for license headers, copied or vendored files, notices,
  dependency terms and other provenance evidence.
- It reports evidence and uncertainty. It does not make a legal determination
  or claim code was copied without evidence.

## Conversation and re-review

When an author replies to a Masthead finding, Masthead can answer in that
thread without waiting for a commit. When new commits arrive, it reviews the
new changes and reassesses its previous findings.

Masthead only resolves findings it owns and only after verifying the fix. It
does not reopen human-dismissed advice or edit human threads.

## Provider keys

Masthead supports multiple model providers. Provider keys belong in Azure
DevOps secret variables or a variable group linked only to the Masthead review
pipeline. They are never entered in the browser, stored in PR properties, or
sent to the extension UI.

## Development

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run build:dev
npm run verify:clean
```

Start with [the engineering documentation](docs/README.md).

## License

MIT - see [LICENSE](LICENSE).

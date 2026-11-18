# Masthead - AI pull request reviews for Azure DevOps

Masthead reviews pull requests in Azure Repos without requiring changes to each
application pipeline. It reads the change in the context of the surrounding
code, posts findings on the PR, maintains its previous findings across new
commits, and answers questions in its review threads.

Masthead is in active development. The dev package is available to shared
organizations; the public stable release is still being prepared.

## Permissions

Masthead requests two scopes that Azure DevOps labels **High privilege**:

| Scope | Azure DevOps name | High privilege | Why |
| --- | --- | --- | --- |
| `vso.code_write` | Code (read and write) | Yes | Writes only the bundled pipeline YAML to the trusted repository selected in Setup, and creates or removes only the Masthead status policy. |
| `vso.build_execute` | Build (read and execute) | Yes | Creates or deletes the Masthead review pipeline definition. The extension does not queue builds. |
| `vso.build` | Build (read) | No | Lists and validates pipeline definitions. |
| `vso.code` | Code (read) | No | Reads pull requests, changed files, related files and code-search results. |
| `vso.extension.data_write` | Extension data (read and write) | No | Stores organization/project settings, the model catalogue and the revision lock. |
| `vso.project` | Project and team (read) | No | Lists projects and repositories for settings and policy management. |

Code and Build also inherit Service hooks (read and write), used only for
Masthead's own pull request event subscriptions.

Masthead does not push application source branches, approve or merge pull
requests, edit other pipelines or edit other branch policies. Provider keys are
not stored in extension data. The complete rationale and the exact actions
behind each scope are in [docs/14-permissions.md](docs/14-permissions.md).

## What it does

- Starts a review when a pull request is created or updated.
- Reviews across repositories and projects selected during onboarding.
- Reads related imports, nearby tests and code-search caller candidates, not
  just the changed diff.
- Posts inline findings and a durable review summary with the guide.
- Skips a repeated review when the same source and target revisions were already
  reviewed, while allowing a deliberate forced re-run.
- Posts a `masthead/review` status that an optional branch policy can require.
- Can create, require or remove only the Masthead status policy from project
  settings.
- Can commit the bundled review pipeline YAML to a trusted repository and create
  the pipeline definition from organization Setup.
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
- **External broker**: an optional customer-hosted broker receives authenticated
  PR events and queues the same pipeline. The reference broker is distributed as
  a Docker image.

The organization settings page records the chosen delivery mode, validates the
central pipeline, and can install or delete a pipeline definition from a trusted
repository and YAML path. Each project settings page lists its repositories and
lets an administrator enable or disable PR reviews per repository.

## Review types

| Type | Default | Focus |
| --- | --- | --- |
| Correctness and impact | Always on | Bugs, changed behavior, affected callers and contracts. |
| Security and privacy | On | Injection, authorization, secrets and unsafe data handling. |
| Tests and verification | On | Whether behavior changes are meaningfully tested. |
| License and provenance | On, optional | Licenses, copied files, notices and missing provenance. |
| Performance and scalability | Off | Work that is wasteful or scales poorly. |
| Maintainability | Off | Material complexity and duplication. |
| Architecture and conventions | Off | Conflicts with existing layers, helpers, contracts or ownership rules. |
| Data and migration safety | Off, path-suggested | Destructive or unsafe schema and data changes. |
| Dependencies and infrastructure | Off, path-suggested | Packages, build steps and infrastructure changes. |

A project or repository can select which optional types apply. The organization
default is inherited unless a project or repository overrides it. Path
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

# Masthead

Masthead adds context-aware AI pull request reviews to Azure Repos. It reviews
the change with surrounding code, posts inline findings and a durable summary,
maintains its findings across new commits, and answers questions in its review
threads.

## Permissions

Masthead requests two scopes that Azure DevOps labels **High privilege**. The
badge is expected.

| Scope | Azure DevOps name | High privilege | Why |
| --- | --- | --- | --- |
| `vso.code_write` | Code (read and write) | Yes | Writes only the bundled Masthead pipeline YAML to the trusted repository selected in Setup, and creates or removes only the Masthead status policy. |
| `vso.build_execute` | Build (read and execute) | Yes | Creates or deletes the Masthead review pipeline definition. The extension does not queue builds. |
| `vso.build` | Build (read) | No | Lists and validates pipeline definitions. |
| `vso.code` | Code (read) | No | Reads pull requests, changed files, related files and code-search results. |
| `vso.extension.data_write` | Extension data (read and write) | No | Stores organization and project settings, the model catalogue and the revision lock. |
| `vso.project` | Project and team (read) | No | Lists projects and repositories for settings and policy management. |

Code and Build also inherit Service hooks (read and write), used only for
Masthead's own pull request event subscriptions.

Masthead does not push application source branches, approve or merge pull
requests, edit other pipelines, or edit branch policies other than the Masthead
status policy. Provider keys are not stored in extension data. The complete
rationale is in the
[permissions document](https://github.com/f-steff/ado-masthead/blob/develop/docs/14-permissions.md).

## What it does

- Starts a review when a pull request is created or updated.
- Reviews across selected repositories and projects.
- Reads related imports, nearby tests and code-search caller candidates.
- Posts inline findings and a review summary with the guide.
- Rechecks previous findings after new commits and resolves verified fixes.
- Answers author comments in Masthead-owned threads.
- Posts a `masthead/review` status that an optional branch policy can require.
- Can create, require or remove only the Masthead status policy.
- Can commit the bundled review pipeline YAML to a trusted repository and create
  the pipeline definition.
- Adds a Masthead tab to the pull request with status, summary, guide and
  findings.

## Deployment

- **Native**: Azure DevOps Incoming Webhooks queue Masthead's own pipeline.
  Nothing is hosted outside Azure DevOps.
- **Broker**: an optional Docker image receives authenticated pull request events
  and queues the same pipeline.

Application pipelines are not modified. Masthead uses its own centrally managed
review pipeline.

## Development status

This is the dev package. It has been exercised against Azure DevOps for native
delivery, review comments, comment replies, branch policy management and pipeline
YAML deployment. The public stable release is still being prepared.

See the [project README](https://github.com/f-steff/ado-masthead#readme) for
setup and local testing.

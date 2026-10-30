# 06 - Security and secrets

## Provider keys

Provider keys are Azure DevOps secrets. They are stored in secret pipeline
variables or a variable group linked only to the central review pipeline.
Masthead never asks for a provider key in the browser and never reads an
ordinary variable group value from a settings page.

The broker does not receive provider keys. It only receives PR events and
queues the pipeline.

## Permissions

The extension installation should request the minimum it needs to configure
hooks and read project settings. Posting review comments is performed by the
central pipeline identity, not by the browser extension.

The central pipeline needs:

- read access to reviewed repositories and PRs;
- permission to contribute to pull request threads;
- access to the linked secret variable group;
- no source-branch write permission for review mode.

## Prompt injection

PR titles, descriptions, comments, code, work items and repository files are
untrusted. The system prompt identifies them as data and does not accept
instructions from them. A repository cannot provide an agent configuration,
MCP server, shell command or plugin that changes the review boundary.

Human comments can ask a question; they cannot grant broader permissions,
change the model endpoint or reveal a secret.

## Tool boundary

The model can request read-only repository tools through a validated adapter.
The publisher is a separate, privileged component. It validates file paths,
line anchors, thread ownership and the current head revision before writing.

No review mode runs repository install scripts, builds or hooks with provider
keys.

## Logging and retention

Logs must not contain provider keys, raw prompts containing secrets, or full
private repository content. Review state and guide content follow the project's
retention rules. A review failure must not be reported as a clean pass.

## Output validation

Model output is parsed into a strict result shape. A missing or invalid finding
fails the review rather than being silently dropped or converted into an empty
success. Publication failures are recorded as incomplete.

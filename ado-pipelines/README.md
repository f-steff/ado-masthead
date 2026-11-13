# Masthead pipeline templates

## Central review pipeline

`review.yml` is the fixed pipeline definition for manual reviews and for the
optional Docker broker. The broker queues this definition with template
parameters; it never chooses the YAML path or executable code.

Create a pipeline definition from this file in the trusted repository that
contains the Masthead release you want to run. Pin `mastheadRef` to a release tag
for production. The default branch is suitable only for development.

The pipeline needs a variable group named `masthead-secrets` containing the
provider key for the selected provider. The default is `DEEPSEEK_API_KEY` with
provider `deepseek` and model `deepseek-chat`. Add `ANTHROPIC_API_KEY` or
`OPENAI_API_KEY` only when those providers are selected. The pipeline uses the
build service's `System.AccessToken` for Azure DevOps; set `MASTHEAD_ADO_TOKEN`
separately only when a dedicated review identity is required.

`MASTHEAD_EXTENSION_ID` and `MASTHEAD_EXTENSION_PUBLISHER` must match the
installed Masthead edition. The template defaults to the dev edition.

## Manual run

Queue the pipeline with:

- `targetProject`: project name or ID;
- `targetRepository`: repository name or ID;
- `pullRequestId`: numeric pull request ID.

`mastheadEventType` stays `manual`. A manual run still reads the organization,
project and repository gates and posts the normal review status. A completed
review for the same source and target revisions is skipped; set `forceReview`
to `true` to run it again.

## Broker mode

Configure the broker with the organization URL, the project that contains this
pipeline, and this definition ID. Its queue request supplies:

- `mastheadEventType`;
- `mastheadDeliveryKey`;
- `mastheadProjectId`;
- `mastheadRepositoryId`;
- `mastheadPullRequestId`;
- thread and comment identifiers for comment events.

The worker re-fetches the pull request, settings and repository content. It
never trusts event text as instructions or as a source of executable paths.
Project and repository gates still apply. A completed run marker in the PR
summary thread prevents re-running the same revision on a retried delivery;
broker and pipeline retries therefore do not spend model tokens twice. Set
`forceReview` to `true` for a deliberate re-run.

Comment events are answered only when the comment is from the pull request
author or explicitly mentions Masthead. A bot reply already parented to the
comment prevents a duplicate answer on a retried delivery.

## Native incoming webhook

Native mode still needs an Incoming Webhook service connection and a pipeline
with a `resources.webhooks` resource whose connection name matches the
extension's native webhook name. That native pipeline wrapper is not included
here yet. Use broker mode for the complete created, updated and comment-event
path until the native wrapper is validated.

## Security

- Keep provider keys and Azure DevOps tokens in secret variables, never YAML.
- Do not print event payloads, provider keys or tokens.
- Treat pull request titles, descriptions, comments, code and work items as
  untrusted data.
- Grant the pipeline identity only the repository, pull request and extension
  data permissions it needs.

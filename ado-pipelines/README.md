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

## Trusted repository and setup script

Keep `review.yml` and, when native delivery is needed, `review-native.yml` in a
small trusted repository such as `masthead-pipelines`. Protect its default
branch and review changes like any other pipeline code.

An administrator can create the pipeline definition with:

```sh
export AZDO_ORG="https://dev.azure.com/contoso"
export AZDO_PROJECT="Contoso"
export PIPELINE_REPO="masthead-pipelines"
export PIPELINE_NAME="Masthead review"
export PIPELINE_YAML="/ado-pipelines/review.yml"
sh ci/setup-review-pipeline.sh
```

The script uses the signed-in Azure CLI identity and creates only the pipeline
definition. It does not create the repository, copy the YAML or write source
code. Copying the YAML once is the manual fallback and works the same way.

The first run asks to authorize the `masthead-secrets` variable group. Grant
that permission to the pipeline, then bind the pipeline in organization Setup.

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

`review-native.yml` is the native wrapper. It subscribes to an Incoming Webhook
service connection named `MastheadPR`, passes the raw service-hook payload to
`native-event.mjs`, and lets that normalizer route created, updated and comment
events. The payload is data; no event text is interpolated into a command or
YAML expression.

Setup:

1. Create an Incoming Webhook service connection named `MastheadPR`.
2. Set its WebHook Name to the value shown on the Masthead organization Setup
   page. Use a long random value; the public endpoint is protected by the
   unguessable name, not by a secret.
3. Create a YAML pipeline from `review-native.yml` in a trusted repository.
4. Create the project service hooks from Masthead Setup, or create the same
   three subscriptions manually.
5. Push a commit or add a comment to a test PR and verify the review and reply
   paths.

Native mode is public. Use broker mode when authenticated event delivery is
required.

## Security

- Keep provider keys and Azure DevOps tokens in secret variables, never YAML.
- Do not print event payloads, provider keys or tokens.
- Treat pull request titles, descriptions, comments, code and work items as
  untrusted data.
- Grant the pipeline identity only the repository, pull request and extension
  data permissions it needs.

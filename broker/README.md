# Masthead broker

Optional event receiver for organizations that do not want to use the public
Incoming Webhook endpoint directly.

The broker accepts Azure DevOps service-hook events, validates a shared secret,
deduplicates them and queues the Masthead review pipeline through the Azure
DevOps Build REST API.

## Run

```sh
docker build -t masthead-broker ./broker
docker run --rm -p 127.0.0.1:8080:8080 --env-file <private-env-file> masthead-broker
```

Expose `POST /event` through HTTPS. Configure the service hook with Basic
authentication using any username and the broker secret as the password, or
send the secret in the `x-masthead-secret` header. The Basic credential is
preferred because it is not a static value embedded in a URL.

The ADO token needs only permission to queue the configured pipeline. It is not
a provider key and must not be given repository write permissions beyond what
the central pipeline itself needs.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `MASTHEAD_BROKER_SECRET` | Yes | Random shared secret, at least 32 characters. |
| `MASTHEAD_ADO_ORG` | Yes | Organization URL, without a trailing slash. |
| `MASTHEAD_ADO_PROJECT` | Yes | Project containing the central pipeline. |
| `MASTHEAD_PIPELINE_ID` | Yes | Numeric build definition ID. |
| `MASTHEAD_ADO_TOKEN` | Yes | Token that can queue the pipeline. |
| `PORT` | No | Listen port, default `8080`. |

## Security notes

- Always terminate TLS in front of the broker.
- Use a long random secret and rotate it through the service hook and container.
- Do not put provider keys in the broker.
- The broker queues a fixed, trusted pipeline; the incoming payload is only
  used to pass identifiers and is never executed.
- Keep the queue endpoint private where the hosting platform allows it.

Keep the environment file outside version control and Docker build contexts.
Do not put credentials in URLs or copy real tokens into shell command history.

## Delivery and retries

The broker accepts PR-created, PR-updated and PR-commented resource payloads.
Comment events use the nested `resource.pullRequest` shape and preserve thread,
comment and comment-revision identifiers. Only identifiers become pipeline
`templateParameters`; arbitrary event content and URLs are never forwarded.

Event IDs identify deliveries; a notification counter alone is not globally
unique. Successfully queued events are deduplicated for five minutes in one
process. Failed requests remain retryable; overlapping deliveries receive a
retryable response until the first queue attempt finishes. Input size, queue
timeout and deduplication memory are bounded.

This cache is not durable across restarts or shared by replicas. A timeout can
also occur after ADO accepted a build. The central worker still needs durable
idempotency and run locking; the broker does not guarantee exactly-once review.
This image has not yet been tested against a live ADO pipeline.

# Masthead broker

Optional event receiver for organizations that do not want to use the public
Incoming Webhook endpoint directly.

The broker accepts Azure DevOps service-hook events, validates a shared secret,
deduplicates them and queues the Masthead review pipeline through the Azure
DevOps Build REST API.

## Run

```sh
docker build -t masthead-broker ./broker
docker run --rm -p 8080:8080 \
  -e MASTHEAD_BROKER_SECRET='<long-random-secret>' \
  -e MASTHEAD_ADO_ORG='https://dev.azure.com/contoso' \
  -e MASTHEAD_ADO_PROJECT='SampleProject' \
  -e MASTHEAD_PIPELINE_ID='123' \
  -e MASTHEAD_ADO_TOKEN='<scoped-token>' \
  masthead-broker
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
| `MASTHEAD_BROKER_SECRET` | Yes | Shared secret for incoming events. |
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

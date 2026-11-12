# 03 - Architecture

## The short version

Azure DevOps raises a PR event. Masthead queues its own central review
pipeline, which reads the reviewed repository with a read-only tool loop,
calls the selected model provider, and publishes findings and a guide back to
the PR.

No application pipeline is edited.

There are two event delivery paths:

- **Native Incoming Webhook**: a project service hook posts the PR event to
  the public ADO distributed-task webhook endpoint. A pipeline with a
  `resources.webhooks` resource runs Masthead's review pipeline.
- **Optional Docker broker**: a service hook posts to a customer-hosted
  container. The broker authenticates the request and queues the same review
  pipeline.

The organization chooses the mode from organization settings. The native mode
is zero external hosting but the endpoint must be treated as public. The broker
mode is the safer choice when authenticated event delivery is required.

## Components

### Extension

The Azure DevOps extension provides:

- organization and project settings;
- repository and review-policy selection;
- the PR tab and review actions;
- onboarding checks for hooks, permissions and pipeline health.

The extension does not run the model and never holds provider keys.

### Native Incoming Webhook

An Incoming Webhook service connection provides a public ADO endpoint. The
review pipeline declares it as a `resources.webhooks` resource. A project
service hook sends `git.pullrequest.created`, `git.pullrequest.updated` and
comment events to that endpoint.

Native mode has no external service, but the endpoint is public. The extension
must warn about this and should generate a high-entropy webhook name. The
pipeline must treat the payload as untrusted and never interpolate it into YAML
or shell text.

### Optional Docker broker

A service hook posts to the customer-hosted broker. The broker authenticates
the request, validates the event type, deduplicates it and queues the central
pipeline with the project, repository, PR, revision and event identifiers.

The broker has a narrow Azure DevOps identity for queueing work. It does not
receive provider keys. It is distributed as a Docker image for self-hosting.
Provider keys remain in the central pipeline's ADO secret variable group.

### Central review pipeline

The central pipeline is a trusted Masthead component. It:

1. resolves the exact PR source and target commits;
2. loads repository context through read-only tools;
3. builds the prompt for the selected lenses;
4. calls the configured model provider;
5. validates findings and publisher ownership;
6. posts or reconciles threads and updates the PR tab state.

Provider keys are secret variables linked only to this pipeline.

### Review store

The review store keeps PR identity, reviewed commits, finding identities,
thread IDs, coverage, status and tab content. It is application data, never a
secret store.

The first implementation stores finding metadata in the Masthead-authored
thread comment itself. A versioned marker records the finding and the source and
target revisions. It is accepted only when the comment author matches the
authenticated pipeline identity. The visible comment remains readable; the
marker lets a later run reconcile without a separate database.

### Implemented first slice

`src/extension/hub` is now an SDK-initialized organization page. It completes
the ADO host handshake before revealing its status.

`src/ado/client.ts` reads the pull request, changed files, fixed commit content,
threads and the authenticated identity. `src/ado/publisher.ts` applies the
reconciliation plan with revision, ownership and stale-plan checks.
`src/worker/ado-review.ts` connects the review engine to that boundary, and
`src/worker/review-pr.ts` is the pipeline entry point.

A separate `src/worker/verification.ts` rechecks active findings against the
current changed-file evidence. Missing or ambiguous evidence is reported as
unverified and leaves the thread open.

The organization hub exposes a master review switch, delivery mode,
central-pipeline binding and the default review profile. The project admin hub
discovers repositories and stores project and per-repository gates plus profile
overrides. A repository with no stored switch follows the configured
new-repository default; the default itself is disabled unless an administrator
opts in.

This slice is manual or pipeline-invoked. The worker reads the persisted
organization and destination-project gates before it spends tokens, applies the
effective review profile and provider/model override, and then publishes through
the normal reconciliation path. A repository with no stored switch follows the
configured new-repository default. The organization Setup page can create the
three project service-hook subscriptions for an existing native incoming-webhook
service connection or broker endpoint; it does not create the service connection,
broker host or central pipeline repository/YAML. The runner now fetches a
bounded set of unchanged relative imports and nearby tests at the reviewed
commit, but it is not a semantic index of every caller. A PR tab now shows the
effective profile, gating state and existing Masthead thread counts.

## Cross-project behavior

Service hook subscriptions are project-scoped. Onboarding therefore creates
and tracks subscriptions in each selected project. The project settings page
controls:

- whether automatic reviews are enabled for the project;
- every repository in the project, with an independent enable/disable switch;
- target branches and exclusions;
- the default review profile;
- optional branch-policy gating.

New repositories start disabled unless the project or organization default was
explicitly enabled, so adding a repository does not silently start spending
tokens. A project-level disable overrides all
repository switches. Projects added later are reconciled during a settings
refresh.

## Organization setup action

The organization settings page provides a **Deploy** action for the selected
mode:

1. Native: create or validate the Incoming Webhook service connection, create
   the trusted review pipeline repository/resource, and create the selected
   project service hooks.
2. Broker: verify the configured broker URL and authentication, then create
   or validate the project service hooks.
3. Show the result of each step and allow retrying a failed step.

The extension cannot deploy the Docker image into an arbitrary customer host.
For broker mode it provides the image and validates the endpoint; the customer
supplies the hosting target. The deploy action records configuration, not
provider secrets.

## Project and branch gating

PR eligibility is controlled per project and repository. A project can turn
reviews off without uninstalling Masthead.

Completion gating is separate. The worker posts a `masthead/review` pull
request status with `pending`, `succeeded` or `error`; a branch policy can
require that status. A repository that is disabled posts `notApplicable`, which
bypasses the required policy instead of blocking completion. The status is
advisory unless an administrator adds the required policy, and Masthead does not
create the policy because that would need code-write access. Review completion,
review failure and review coverage remain distinct states.

## Why not run inside application pipelines

A per-repository task would require editing each pipeline, duplicate the task
version across repositories and miss PRs in repositories with no pipeline.
Hooking PR events gives one consistent review path and one place to update.

An optional Masthead pipeline task remains useful for deeper or manual review,
but it is not the automatic baseline.

## Deployment boundary

Native mode needs only Azure DevOps: the service connection, pipeline and
service hooks all live in the organization. The optional broker mode needs a
customer-supplied container host and a small queueing identity. The central
review pipeline needs compute for every review in both modes.

Until credentials and a hosted deployment are available, the review engine can
run locally against fixtures and a mocked queue/store. The architecture remains
the same.

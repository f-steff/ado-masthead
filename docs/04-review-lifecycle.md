# 04 - Review lifecycle

## Events

| Event | Effect |
| --- | --- |
| PR created | Queue an initial review. |
| PR updated with a new source commit | Queue a re-review of the new delta and outstanding findings. |
| Author replies in a Masthead-owned thread | Queue a targeted conversation or recheck; no commit is required. |
| Author mentions Masthead elsewhere | Answer only when the request is explicit and authorized. |
| Masthead's own comment or status changes | Ignore to prevent a feedback loop. |
| Duplicate or out-of-order delivery | Deduplicate by event, revision and comment identity. |

## Four kinds of work

- **Conversation**: explain a finding, respond to disagreement or acknowledge a
  correction using the thread and current code.
- **Targeted recheck**: verify a claimed fix or a disputed assumption.
- **Commit re-review**: inspect the new delta and affected context, then
  reassess prior findings.
- **Full review**: a deliberate complete pass, used on first review, explicit
  request, or when history makes incremental coverage unreliable.

A reply does not always need a full review, but the user must never have to
push a dummy commit to get an answer.

## Finding state

Each finding stores:

- stable ID and lens;
- severity and confidence;
- title, evidence and suggested fix;
- file and line history;
- ADO thread and comment IDs;
- ownership;
- status history;
- the source revision that last verified it;
- whether it is confirmed, unresolved or needs human review.

## Resolution rules

1. Resolve only a Masthead-owned finding that is verified fixed or no longer
   applicable.
2. Include the revision and a short explanation when resolving.
3. Do not resolve a finding merely because it disappeared from model output.
   Missing coverage is not proof of a fix.
4. Leave still-valid findings open and avoid duplicate replies.
5. Preserve human dismissals and resolved human threads.
6. Repost a verified regression as a new linked finding; do not silently reopen
   rejected advice.

## Publication order

1. Reconcile prior thread state.
2. Update or add the single summary.
3. Add new findings.
4. Update the PR tab with the reviewed revision and guide.

A failed publication is reported as incomplete. It is never counted as a
successful review.

## Implemented policy boundary

`src/review/lifecycle.ts` builds a publication plan without making ADO calls.
It keeps missing findings open, accepts explicit current-revision fix or
withdrawal evidence, leaves human decisions untouched, and links regressions
to earlier bot-fixed threads. Source and target revisions must both match.

`src/worker/events.ts` decides whether to review, reply or ignore an event.
Repository eligibility is checked first. The decision uses re-fetched PR and
thread state, not author/status claims in a public webhook. An ordinary author
reply in a bot-owned thread needs no mention. Own comments, answered comment
revisions and unrelated human conversations are ignored.

`src/worker/conversation.ts` can run a bounded, targeted answer using supplied
thread history and current code. It returns an answer for one human comment
and whether a code recheck is needed. It never returns a resolution command.
Automatic thread retrieval, publication and durable answer tracking still
require the ADO adapter.

These are tested policies, not a connected PR publisher. A production adapter
still needs to retrieve ADO state, verify fix evidence against code, maintain
durable run/answer records, and recheck revisions and ownership before applying
any action. Missing output or filtered findings are never fix evidence.

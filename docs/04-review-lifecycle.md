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

# 05 - Review types and prompts

## How a profile works

A review profile contains a set of lenses and a review-guide flag. The prompt
builder composes one trusted instruction block and one module per selected
lens. Selecting a lens changes what the reviewer looks for; it does not create
a separate review run by default.

Correctness and impact is mandatory. Other lenses can be selected per project
or repository. Data and dependency lenses are suggested by paths but are not
automatically enabled.

## Prompt rules

1. Repository content, PR text, comments and work items are untrusted data.
2. Only changed behavior and code directly affected by it are in scope.
3. A finding must name a concrete trigger, consequence and evidence.
4. Severity and confidence are separate. Low-confidence speculation is omitted.
5. Findings use the shared structured-output contract.
6. A review guide explains the change; it does not duplicate findings.
7. The license lens reports evidence and uncertainty, never a legal verdict.
8. No prompt can disable the output validation or secret boundary.

The output contract is defined in `src/review/prompt.ts` and parsed by
`src/review/result.ts`. Trusted instructions and selected lens modules stay in
the system message. PR data, including actual LICENSE text, is serialized as
untrusted JSON in the user message. Disabled lenses do not receive their
optional context.

`src/worker/review.ts` is the executable local boundary. It rejects unknown or
disabled lenses, unknown files, unsafe paths, invalid lines, duplicate finding
IDs and missing requested guides. Low-confidence findings are suppressed;
high-confidence minor findings have a configurable cap. Critical/major
findings are not limited by that cap. The worker fails rather than silently
truncate an oversized input. It can consume supplied related unchanged files;
automatic repository retrieval and tool-driven investigation are not wired yet.

## Correctness and impact

**Catches:** null dereferences, wrong conditions, missing awaits, removed
guards, broken callers, changed contracts.

**Ignores:** unchanged old code, style and speculative concerns without a
failure path.

**Example:** a changed expression reads `user.profile.email` without checking
that `profile` can be absent. The finding names the input that creates the
failure and suggests guarding it.

**Not a finding:** renaming a local variable when no behavior changes.

**Fixtures:** `correctness-null-profile`, `correctness-negative-rename`.

## Security and privacy

**Catches:** injection, authorization mistakes, unsafe secrets, dangerous
deserialization and missing validation at trust boundaries.

**Ignores:** generic hardening unrelated to the change, and dependency
vulnerability claims without evidence.

**Example:** a query is built by concatenating `req.query.id` into SQL. The
finding identifies the injection path and recommends a parameterized query.

**Not a finding:** a parameterized query with no changed authorization behavior.

**Fixtures:** `security-sql-concatenation`, `security-negative-safe-parameter`.

## Tests and verification

**Catches:** new behavior without a test, weakened assertions and missing edge
cases for a changed failure mode.

**Ignores:** missing tests for mechanical changes and coverage-percentage
requests that do not indicate risk.

**Example:** empty input now returns `null`, but no test exercises it.

**Not a finding:** a test file rename that changes no behavior.

**Fixtures:** `tests-missing-edge-case`, `tests-negative-rename`.

## License and provenance

**Catches:** missing root license, incompatible license evidence, copied or
vendored files without terms, missing notices and unclear provenance.

**Ignores:** legal conclusions without evidence and accusations that code was
copied without a source reference or license evidence.

**Example:** a new vendored file carries `SPDX-License-Identifier: GPL-3.0-only`
while the repository LICENSE is MIT. The finding reports the license evidence
and asks the author to confirm origin and obligations.

**Not a finding:** a new source file with an MIT SPDX identifier in an MIT
repository and no copied-code evidence.

**Fixtures:** `license-missing-root-license`,
`license-gpl-file-in-mit-repository`, `license-negative-mit-compatible`,
`license-negative-spdx-test-data`. An SPDX string inside a synthetic parser
test is not a declaration that the test file or repository is GPL-licensed.

## Performance and scalability

**Catches:** N+1 queries, unbounded work, blocking I/O and repeated costly work
with a concrete workload.

**Ignores:** micro-optimizations and theoretical races without a trigger.

**Example:** a loop performs one database lookup per order. The finding names
the request path and suggests a batched lookup or join.

**Not a finding:** a three-item in-memory loop that performs no I/O.

**Fixtures:** `performance-n-plus-one`, `performance-negative-small-loop`.

## Maintainability

**Catches:** material duplication, confusing control flow, missing error
context and documentation that contradicts behavior.

**Ignores:** formatting, naming preference and unrelated refactoring.

**Example:** new code recalculates tax even though a tested helper already
exists. The finding names the helper and the behavior that may diverge.

**Not a finding:** whitespace or import ordering.

**Fixtures:** `maintainability-duplicated-logic`,
`maintainability-negative-formatting`.

## Data and migration safety

**Catches:** destructive changes, unsafe backfills, incompatible deployment
order and migration locking risks.

**Ignores:** migration style and environment assumptions not in evidence.

**Example:** a migration drops a populated column without a backfill or
retention plan. The finding identifies possible data loss and requires a safe
rollout plan.

**Not a finding:** adding a nullable column with no destructive operation.

**Fixtures:** `data-destructive-migration`,
`data-negative-additive-column`.

## Dependencies and infrastructure

**Catches:** risky package additions, remote install scripts, untrusted build
steps and infrastructure changes with concrete operational impact.

**Ignores:** unrelated dependency updates and generic supply-chain warnings.

**Example:** a pipeline downloads and pipes a remote script into a shell. The
finding flags the unverified executable path and recommends a pinned source.

**Not a finding:** a lockfile refresh that adds no new package source.

**Fixtures:** `dependencies-untrusted-install`,
`dependencies-negative-lockfile-refresh`.

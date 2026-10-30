# Architecture questions and next research steps

Research date: **2026-10-20**. Everything proposed here is an option or spike,
not an approved implementation plan.

## 1. An extension is not an always-running LLM host

An Azure DevOps UI extension normally contributes browser-hosted pages/actions.
Its iframe is not a reliable background process: a review must still run when no
one has the PR page open. Marketplace installation does not by itself create
compute, webhook subscriptions, a bot identity, or provider-secret access.

For the preferred automatic experience, distinguish three parts:

1. **Native extension**: organization/project onboarding, repo policy, credential
   references, PR actions and review tab.
2. **Event/queue service**: receives authenticated PR events, deduplicates them,
   schedules execution, and handles retries/obsolete runs.
3. **Review worker**: obtains immutable source revisions, retrieves context, calls
   the model, validates findings and publishes through a restricted ADO API layer.

Microsoft documents [service hooks](https://learn.microsoft.com/en-us/azure/devops/service-hooks/overview?view=azure-devops)
and [PR event types](https://learn.microsoft.com/en-us/azure/devops/service-hooks/events?view=azure-devops).
Use created/updated **and comment** events for the required continuing review;
explicitly prevent
the bot's own comments/status updates from retriggering itself. Event names and
payload versions should come from Microsoft, not be copied from a possibly
stale vendor example.

"All PRs" needs an explicit scope: existing/future projects and repositories,
drafts, target branches, forks, bots, exclusions, denied permissions, and Server
versus Services. Project hook permissions and onboarding reconciliation matter;
an organization-wide install is not proof of organization-wide coverage.

### Required conversation and iteration lifecycle (R10/R11)

The reviewer must behave as a continuing participant, not a one-shot report.
**Answer author comments without requiring a new commit. Automatically re-review
when new source commits arrive, updating previous findings and resolving fixes.**
The user requirements are firm; the execution choices below are proposals to
validate, not a selected implementation.

| Event | Proposed action | Expected publication |
| --- | --- | --- |
| PR created / becomes eligible for review | Initial review of the complete PR change with repository context. | Stable bot-owned finding threads and one summary/tab result. |
| Author replies in a bot-owned finding thread | Automatically run a targeted conversation turn with the finding, thread history and relevant current code; no mention or new commit required. | Answer in the **same thread**, explaining evidence or acknowledging a correction. |
| Human explicitly mentions the bot outside its finding threads | Targeted answer, or a requested review action, subject to access/policy checks. | Reply in that discussion; do not interrupt unrelated human-only conversations. |
| Author says a finding is fixed | Recheck that finding against current code; do not accept the claim as proof. Escalate to broader analysis if context requires it. | Explain and resolve a verified fix, or explain why it remains open. |
| New source commit / PR iteration | Automatically schedule re-review; cover new changes, affected unchanged context and outstanding prior findings. | Update existing findings and summary, resolve verified fixes, add only genuinely new findings. |
| Explicit rerun action | Offer targeted recheck and full-PR review; full review bypasses unchanged-code reuse within budget. Command names/UI remain to be designed. | Reconcile with the same review, not an unrelated duplicate set of comments. |
| Bot comment/status or duplicate event | Ignore own activity; deduplicate already processed events. A metadata-only PR update need not rerun code analysis. | No feedback loop or duplicate reply. |

#### A reply is not always a complete rerun

- **Conversation turn:** a fresh bounded LLM call using persisted thread/finding
  context, with read-only code retrieval if needed. A persistent provider session
  is optional, not required for conversational continuity.
- **Targeted recheck:** verify a disputed or claimed-fixed finding and related
  code. If the author explains an invalid assumption, withdraw the finding with
  an explanation rather than incorrectly record a code fix.
- **Commit re-review:** analyze the newly pushed delta, invalidate any affected
  prior context, and reassess previous findings. Do not blindly reuse results
  because the finding's own file did not change: callers/dependencies may have.
- **Full rerun:** a deliberate broader pass, or fallback when change/force-push
  history makes incremental coverage unreliable. Reuse stable finding identity.

The required behavior is automatic; incremental execution is an optimization.
If a reply requires wider investigation, escalate to a review job and visibly
report its progress rather than requiring the author to push a dummy commit.

#### Persistent finding state and resolution rules

Persist the PR identity, reviewed source/target SHAs and iteration, stable
finding IDs, evidence/category, file/anchor history, ADO thread/comment IDs,
ownership, status history and the comment revisions already answered. Store
review coverage and incomplete/error outcomes too. This is application data,
**not** a reason to store provider credentials in ordinary extension storage.

1. Match findings by stable identity/evidence, not just line number or fresh model
   wording. Re-anchor moved code using ADO iteration tracking where possible;
   preserve thread history or explicitly link a replacement if re-anchoring fails.
2. Resolve only bot-owned findings whose issue is verified fixed or no longer
   applicable at the reviewed revision. Add a concise reason and relevant commit.
   Distinguish a code fix from a withdrawn false positive or removed requirement.
3. A finding absent from new model output is **not automatically resolved**.
   Skipped files, truncation, retrieval failures or exhausted budgets mean
   unverified/incomplete, not fixed. Keep those findings open and disclose why.
4. Leave still-valid findings in their existing threads; avoid repeated comments
   when nothing changed. Update the summary/tab with current open/resolved counts
   and coverage, without deleting prior discussion.
5. Preserve human resolution/dismissal decisions. Do not reopen rejected advice
   automatically. A material regression after a bot-verified fix should be
   revalidated and reported with links to the prior finding; decide separately
   whether to reopen a bot-resolved thread or create a linked regression thread.
6. Conversational comments are untrusted context, not permission to change
   provider endpoints, reveal secrets, execute code or broaden access. Verify the
   requester's access and any authorization needed for rerun commands.

#### Scheduling and race conditions

- Serialize publication for each PR and use durable idempotency keys for events,
  source revisions, comment revisions and publication actions. Delivery may be
  duplicated/out of order; retries after partial posting must not duplicate it.
- Coalesce rapid pushes and replies; cancel/supersede stale analysis. Preserve
  pending author questions and answer against the latest relevant code/discussion.
- Recheck head SHA, thread status and newer comments before publishing. Do not
  resolve a finding or report a successful current review from a superseded run.
- Bound conversation turns and per-PR spend; do not answer the bot's own replies
  or repeatedly re-answer an unchanged comment. Comment-edit handling needs an
  explicit test against the available ADO events/API behavior.
- Branch-policy build validation handles code updates, **not arbitrary comment
  replies**. A comment service hook still needs a receiver/worker, or a broker
  that queues the trusted central review pipeline.
- If that central pipeline is used, pass explicit PR/thread/comment IDs, expected
  revisions and an operation mode. Such jobs may have `Build.Reason` other than
  `PullRequest`; existing tasks that simply skip non-PR builds may need adaptation.
  They must not silently ignore author questions.

## 2. ADO secrets are the most important early feasibility spike

The requirement is **provider API keys stored as ADO secrets**. Keep that stricter
than "encrypted somewhere".

| Mechanism | Meets the stated storage requirement? | Runtime consequence |
| --- | --- | --- |
| Secret pipeline variables / Library variable groups | Yes | Decrypted for authorized pipeline jobs/tasks. Ordinary management responses hide values. |
| Custom ADO service connection with secret authorization fields | Candidate | Good pipeline credential UX; validate task access, permissions/checks, redaction and any broker design. Not a generic browser-readable secret store. |
| Key Vault-linked ADO variable group | Only if Key Vault-backed storage is acceptable | Values live in Azure Key Vault and are fetched for a job. This is not literally secret-value storage in ADO. |
| Ordinary Extension Data Service document | No | Useful for configuration, references and review data; not an ADO secret facility. |
| Encrypted extension document with a shipped/shared decryption key | No | Encryption claims do not establish a secure key boundary or secret resource semantics. |
| Vendor-managed vault, even a reputable one | No under the strict wording | Explicitly different from ADO-managed secrets. |
| Repo config, localStorage, task YAML literals or PR properties | No | Exposes credentials to readers, browser code, logs or repository history. |

Microsoft's [secret-variable documentation](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/set-secret-variables?view=azure-devops)
explains runtime availability and explicit environment mapping. Its
[variable-group documentation](https://learn.microsoft.com/en-us/azure/devops/pipelines/library/variable-groups?view=azure-devops)
shows secret values returned as `null`, describes pipeline authorization, and
warns about pipeline authors extracting linked secrets.

**Do not design an external worker around downloading plaintext variable-group
secrets through the normal management API.** No supported general-purpose
plaintext readback path was established here. A claim that a settings page can
"just read the ADO secret" needs to be proved before implementation.

### Three hosting choices

| Choice | Application pipelines changed? | ADO secrets | Tradeoff |
| --- | --- | --- | --- |
| A. Webhook -> dedicated, centrally managed review pipeline | No edits to existing pipelines; one managed review pipeline is provisioned | Natural fit: authorized job consumes secrets | Still uses Azure Pipelines compute and capacity; validate cross-repo access and non-PR-build context. |
| B. Webhook -> self-hosted/hosted worker | No | Unresolved under strict requirement | Clean background architecture, but needs an approved credential broker or a deliberate change to secret-storage requirement. |
| C. Inject reviewer with a pipeline decorator | Possibly no per-repo task edits | Can consume authorized pipeline resources subject to design | Only runs when a pipeline job exists/runs. **Not** equivalent to hooking every PR. |

Choice A may satisfy "no pipeline changes necessary" in the sense of **no
changes to application pipelines**, but not "no pipelines exist at all". Do not
silently substitute one interpretation for the other. A branch-policy-driven
central pipeline is another possible trigger, but is branch-scoped and does not
automatically cover drafts or every future target branch.

For a central execution pipeline, keep its definition in a trusted repository
and pin the reviewed repository/SHA as input. Never execute PR-provided pipeline
YAML, install scripts, hooks or agent configuration with provider secrets.
Constrain repository reach even if the job needs to read more than `self`.

Secret storage does not mean the key never leaves ADO: it must be available in
worker memory and sent to its intended provider for authentication. It must not
enter model prompts, review artifacts, telemetry or browser responses.

## 3. Existing pipeline examples have a recurring setup error

For **Azure Repos Git**, YAML `pr:` is not the PR validation trigger. Configure
**Build Validation branch policies** on target branches. This is true for cloud
Azure Repos as well as relevant Server setups, not only "old TFS".

Sources: [Microsoft Azure Repos pipeline documentation](https://learn.microsoft.com/en-us/azure/devops/pipelines/repos/azure-repos-git?view=azure-devops),
[PR-Agent Azure instructions](https://docs.pr-agent.ai/installation/azure/),
and [ArcLight setup](https://github.com/viettdann/arclight-ado-claude-pr-review#running-it-on-pull-requests).
Several Marketplace examples contain an ineffective `pr:` block; do not copy
them uncritically. Also verify ADO token mapping and Build Service **Contribute
to pull requests** rather than granting repository write access by default.

## 4. What repository-aware reviewing should mean

Start from the exact PR source/target commits and a merge-base diff. The agent
can then inspect **unchanged related code**, not just larger diff context:

- Enumerate project manifests, language/build/test conventions and directories.
- Read selected file ranges at an immutable source/base revision.
- Find definitions, references/callers, related tests and public API consumers.
- Inspect earlier behavior and migrations when relevant.
- Load trusted target-branch instructions and linked work-item acceptance criteria.
- Optionally retrieve linked-repository contracts with separately granted access.

Do not promise exhaustive understanding. Report inspected/skipped files, missing
context, truncation and budget exhaustion. For large repositories use bounded
search and retrieval; AST/symbol indexes or embeddings are options, not necessary
prerequisites for the first experiment.

[Dekiru's source](https://github.com/dekirusolutions/azure-pipeline-pr-review/tree/main/GPTPullRequestReview/src)
is a particularly relevant small TypeScript example: tools cover diff, file
reading/search, directory/metadata/history, plus review coverage tracking and a
bounded loop. Its provider factory does not currently demonstrate native
Anthropic. Its optional global TLS-verification bypass must not be adopted.

Language detection should return a language **per file**, with a documented
fallback for extensionless/ambiguous/embedded-language files. Extension and
shebang mapping is a cheap start; manifests/framework hints and a proper language
classifier can improve it. Do not equate response language (Japanese/English)
with programming-language detection.

## 5. LLM execution: TypeScript options, not a PicoClaw port by default

An API-hosted LLM runs at the model provider. Our worker sends messages/tools,
executes permitted tool requests locally, feeds back results, and stops under
explicit limits. Local models instead need an Ollama/vLLM/etc. inference service;
the extension is not itself the model runtime.

| Option | Why evaluate | What remains to prove |
| --- | --- | --- |
| Small TS loop using official SDKs / a maintained adapter library | Narrow review-only tool surface; modest operational footprint; easier to audit than a general coding assistant | Native Anthropic plus OpenAI/DeepSeek behavior, streaming/tool call differences, retries, structured output, token accounting and compaction. |
| [AI SDK](https://ai-sdk.dev/docs/agents/overview) | Maintained provider ecosystem and bounded tool-loop primitives | SDK/version licensing, Node/runtime compatibility, provider-specific behavior, safe tool execution. Do not infer it is OpenCode V2's internal implementation. |
| [OpenCode V2 embedded SDK](https://opencode.ai/v2/docs/build/sdk) | TypeScript embedding via `@opencode/sdk`; no listener required; mature agent/provider concepts | Worker runtime support, footprint, permission isolation, config/plugin loading, concurrency, version pinning and secret injection. |
| [OpenCode V2 network client](https://opencode.ai/v2/docs/build/client) | Run a controlled OpenCode service and call it with `@opencode/client` | Service ownership, authentication, tenant/session isolation, cleanup and network overhead. |
| [PicoClaw](https://github.com/sipeed/picoclaw) | MIT Go code; compact agent/tool/provider design, budgets/routing/skills as inspiration | It is a general personal assistant, not an ADO reviewer or TS library; a TS rewrite loses its Go footprint advantage and adds maintenance. |
| Existing reviewer service: PR-Agent or Kodus | Reuse actual review orchestration and ADO integration | Fit to secrets, UI, licensing, operating model and desired repository context. |

**Tentative recommendation:** compare a constrained TS worker and OpenCode V2
embedding against an existing PR-Agent/Kodus integration before choosing an
engine. Learn small design ideas from PicoClaw; do not start by porting a complete
assistant, chat channels, scheduling and unrestricted shell tools.

### Provider model to borrow from OpenCode V2

The [V2 provider guide](https://opencode.ai/v2/docs/providers) documents a provider
registry, model catalog, runtime packages, custom compatible endpoints, model
capabilities/limits/costs and provider-specific credentials. These are good design
ideas; the CLI UI is not the provider abstraction itself.

Keep a provider's protocol, endpoint, model/deployment ID, capabilities and
**secret reference** separate. At minimum test:

1. OpenAI with its native supported request path.
2. Anthropic with native Messages/tool semantics.
3. DeepSeek through the appropriate supported OpenAI-compatible adapter.

"OpenAI-compatible" does not guarantee interchangeable tool schemas, reasoning
fields, context limits, streaming deltas, JSON output, temperature or token-limit
parameters. Test errors, retry-after handling and cancellation as well as a
successful text completion. Never silently fail over to another provider: that
can move private code across a data-residency boundary.

The existing [ADO OpenCode task](https://github.com/trojanmartin/opencode-azdo-extension/blob/main/src/opencode.ts)
imports `@opencode-ai/sdk` and old server APIs. It is a learning reference, **not
proof of V2 compatibility**. Use only V2 documentation when designing a V2 host.

## 6. Native PR tab and the ado-static starting point

Microsoft documents the PR pivot target
[`ms.vss-code-web.pr-tabs`](https://learn.microsoft.com/en-us/azure/devops/extend/reference/targets/overview?view=azure-devops).
Keep the brief findings inline and use a dedicated review tab for:

- Intent, architecture/flow changes and suggested reading order.
- Confirmed findings versus tentative observations; links to native PR threads.
- Reviewed commit/iteration, related files inspected, skipped files and limitations.
- Provider/model/rules version, cost, time and review history.
- Rerun/cancel/preview-publish actions with server-side authorization.

The tab must not receive provider secrets or unrestricted worker credentials.
Render PR text, source excerpts, diagrams and model output as untrusted data.
Avoid showing raw hidden reasoning; concise evidence and tool/context provenance
are sufficient and safer.

If we build a new extension, base its scaffolding on **ado-static**, as requested.
Its public [source](https://github.com/f-steff/ado-static) and local README/manifest
were inspected at a high level. Useful patterns include TypeScript builds,
manifest composition, project/organization settings, pipeline task packaging,
extension storage, documentation and release/test gates.

Do **not** assume the existing Static build report tab is a PR tab, its storage
is a secret vault, or its UI provides backend compute. Those require new designs.
No code was copied and no changes were made to ado-static during this research.

## 7. Security and reliability requirements discovered

- Read-only source tooling by default; no arbitrary shell/network/MCP/plugin
  loading from PR-controlled files. A denied `git push` command is insufficient
  when a token can write through REST or another process.
- Separate model-facing read tools from the privileged publisher. Validate every
  file path, line range, review ownership and current commit before publishing.
- Do not run package installation, builds/tests or repository hooks with secrets
  unless a separately isolated, explicitly authorized execution mode requires it.
- Pin tooling/dependencies; do not download and execute a floating installer on
  every sensitive review without a supply-chain decision.
- Authenticate hook delivery with the mechanism supported by ADO; validate tenant,
  project and repository independently. Protect replay/idempotency and URLs/logs.
  Do not assume GitHub-style HMAC signatures exist on every ADO webhook.
- Bound payload sizes, repository reads, model calls, concurrency, retries,
  duration and cost. Cancel stale runs and coalesce rapid source pushes.
- A completed review, a skipped review, an incomplete review and an execution
  failure need different results. Bind PR statuses to the reviewed iteration.
- Prefer a native PR status if a PR status branch policy is intended; a build
  result, commit status and PR status are different ADO surfaces.
- Never delete all PR comments on rerun. Match bot identity and stable markers;
  preserve human threads/dismissals and avoid reopening rejected advice.
- Make storage retention, provider processing and indexing/embedding providers
  explicit. BYOK does not mean code is processed exclusively by that provider.

## 8. Proposed evaluation plan

Use a public or synthetic mixed-language test repository, not private production
code. No trial or implementation is performed by this research document.

| Spike | Question / success criterion |
| --- | --- |
| S1 - Onboarding and hooks | Can one onboarding flow cover chosen projects/repos and future repos, review without a browser, handle updates/comments and uninstall cleanly? |
| S2 - Secrets and compute | Prove an authorized ADO-secret consumption path for a central job or approved broker. No plaintext management readback, browser disclosure, logs or artifacts. Clarify whether one managed pipeline is acceptable. |
| S3 - Existing engine fit | Run comparable cases on PR-Agent, Kodus and the small Dekiru/Byte Insights/OpenCode candidates. Check package/source identity and license before reuse. |
| S4 - Provider parity | OpenAI, Anthropic, DeepSeek: same tools/findings contract, explicit model limits, invalid key, throttling, timeout, streaming and cancellation tests. |
| S5 - Repository context | A changed call site with a bug only discoverable in an unchanged definition/test must be found; record what files were actually inspected. |
| S6 - Comments and iteration | New commits automatically trigger re-review. Added/deleted/renamed files, CRLF, moved anchors, changed callers, force-push, fixed/still-valid/regressed findings and human dismissals retain correct identity/history. Verified fixes resolve; omitted or unreviewed findings do not. |
| S7 - Review tab | Render persisted summary safely and reopen same iteration without an LLM call; stale version is obvious; secret never reaches iframe. |
| S8 - Injection and permissions | Malicious source/comments/instructions cannot execute tools, read secrets, redirect endpoints, forge logging commands or write source branches. |
| S9 - Budget and quality | Measure actionable-findings precision/recall, latency, spend, skipped coverage and false positives on seeded cases. Confidence is not a calibrated correctness probability. |
| S10 - Author conversation | An ordinary author reply to a bot finding receives a contextual answer in that thread without a new commit; test clarification, disagreement, false-positive withdrawal, claimed fix and an explicit mention elsewhere. Unrelated human threads and bot replies do not trigger a loop. |
| S11 - Event/rerun reliability | Duplicate/out-of-order comments and pushes, edited comments, partial-publication retries, concurrent new commits and closed PRs do not lose questions, duplicate replies or publish stale resolutions. Test targeted/full reruns and comment-triggered central jobs that are not PR validation builds. |

### Decisions needed before implementation

1. Does "no pipeline changes" permit **one centrally provisioned review pipeline**?
2. Are keys literally required to reside in ADO, or is customer-owned Key Vault
   acceptable? Vendor-owned storage should remain a separate decision.
3. Services only initially, or Server/TFS too?
4. Is a Python reviewer service acceptable behind a TypeScript extension?
5. Is AGPL/GPL contribution/reuse acceptable, or must the foundation remain MIT?
6. Advisory review first, draft approval first, or immediately enforceable status?
7. What source-retention, regional processing and optional embedding rules apply?
8. For R10/R11, validate automatic author-thread replies as the baseline; choose
   optional mention/command behavior elsewhere, reviewer opt-outs, conversation
   budgets and how to surface a material regression after a previously fixed issue.

These decisions determine whether we should contribute to an existing platform,
wrap an existing engine with an ado-static-derived UI, or build a narrowly scoped
new TypeScript worker. They should not be decided implicitly by a prototype.

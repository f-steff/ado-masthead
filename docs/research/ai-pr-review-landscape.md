# Azure DevOps AI PR review landscape

Research date: **2026-10-20**.

## 1. Executive conclusion

There is no reason to start by implementing an LLM wrapper from scratch.
Existing projects already demonstrate provider adapters, inline comment APIs,
incremental review, tool-based repository inspection, and review reconciliation.
The less common combination is the product we actually want:

> Organization/project onboarding that enables automatic PR reviews without
> editing application pipelines, backed by a constrained repository-aware agent,
> ADO-managed secrets, inline findings, an explanatory PR tab, author-thread
> replies, and automatic re-review that maintains findings across new commits.

Recommended investigation order:

1. **PR-Agent**: strongest permissively licensed, webhook-capable starting point
   for contributing to an existing reviewer; Python rather than TypeScript.
2. **Kodus**: strongest TypeScript platform candidate with Azure Repos webhooks
   and broad BYOK support; substantially larger deployment and AGPL/commercial
   licensing boundaries.
3. **Dekiru's reviewer**: small MIT TypeScript agent with actual repository tools;
   its Marketplace listing is unpublished, but its repository is public.
4. **Byte Insights' AI-Powered PR Comments**: MIT TypeScript reference for provider
   calls, structured findings, batching, deduplication, and comment lifecycle.
   Whole-PR review is not whole-repository retrieval.
5. **OpenCode AI Agent**: existing MIT ADO integration worth helping, but its
   inspected SDK integration is V1-era and needs V2 compatibility work.
6. **Guided PR Review / Scrutin / InnovaApps**: evaluate the user experience, not
   presumed reusable code. They demonstrate that a useful PR tab is feasible.

Do not decide to fork solely from screenshots, a feature list, or a Marketplace
"Free" badge. Check source/license, installation state, data flow, safe execution,
and source-to-package correspondence first.

## 2. Scope and method

Starting point: the user's [Marketplace search](https://marketplace.visualstudio.com/search?term=review%20pipeline&target=AzureDevOps&category=All%20categories&sortBy=Relevance)
and nine supplied extensions. Additional discovery used public web search,
Marketplace descriptions and metadata, GitHub repositories, and vendor docs.

The public Gallery `extensionquery` API was queried with installation target
`Microsoft.VisualStudio.Services.Cloud`, page size 250, flags 914, and searches
`review`, `PR agent`, `CodeAnt`, `CodeRabbit`, and `Qodo`. Every page was followed:

| Query | Reported records | Pages |
| --- | ---: | ---: |
| review | 582 | 3 |
| PR agent | 2,238 | 9 |
| CodeAnt | 1 | 1 |
| CodeRabbit | 0 | 1 |
| Qodo | 0 | 1 |

These are **search records, not product counts**. Results were deduplicated by
publisher + extension name, keeping the most recently updated record. The union
contained 1,929 IDs. A deliberately broad AI/review text filter selected 306
candidates, including false positives, old identities, inaccessible assets, and
101 records marked unpublished. The [inventory](marketplace-inventory.md)
separates these rather than claiming 306 active AI reviewers. Diffsift was added
from web discovery; its description did not match that initial text filter.

Limitations: Cloud-target search does not establish exhaustive Server-only
coverage; search ranking/indexing can omit products; private extensions cannot
be inventoried publicly. Vendor integrations without a Marketplace listing are
included separately. Repository metadata was checked for the principal reuse
candidates, but every fork's source was not audited. No runtime tests were done.

### Evidence notation

- **D**: described in the linked listing or official documentation; not tested.
- **S**: selected source implementation inspected; not a complete audit.
- **?**: insufficient evidence. It does not mean the feature is impossible.
- **Not documented** is not a definitive assertion that a feature is absent.
- **Public source** and **permissive reuse license** are separate questions.

## 3. Requirements: what counts as a match?

| ID | Desired feature | Evidence needed for a real match |
| --- | --- | --- |
| R1 | Automatic PR hooks, no application-pipeline changes | Service hooks or equivalent background integration; works with no browser open; defined onboarding scope and new-repository behavior. |
| R2 | Optional pipeline tasks | Separate tasks that enrich a baseline review, not a mandatory task disguised as optional integration. |
| R3 | Review changes against the entire codebase | Ability to retrieve unchanged related files, definitions/callers/tests, preferably with explicit coverage and budgets. |
| R4 | Inline code comments | Actual ADO file/line threads, not just file names and line numbers in a summary. |
| R5 | Explanatory PR review tab | A contribution on the PR page with persisted results, not just a build report or project dashboard. |
| R6 | Per-file language detection | Deterministic detection/routing of mixed-language files; "supports all languages" alone is insufficient. |
| R7 | Broad BYOK providers | At least native Anthropic and OpenAI, plus tested DeepSeek; endpoint/model overrides and provider capability handling. |
| R8 | API keys stored as ADO secrets | Secret pipeline variables/variable groups or an explicitly validated service-connection secret mechanism; not ordinary extension data or a vendor vault. |
| R9 | Suitable agent runtime | Bounded tool loop, read-only repository tools, validated findings, safe execution and observable cost/coverage. |
| R10 | Answer PR authors' comments | Respond in the relevant review thread using its discussion, finding evidence and current code; comment-triggered execution without requiring a new commit. Explicitly distinguish automatic replies from mention/command-only interaction. |
| R11 | Automatically re-review new commits and maintain previous findings | Detect a changed PR source revision, review new changes and affected context, reassess prior findings, update the existing summary/threads, and resolve verified fixes without duplicates or overwriting human decisions. |

"Whole diff", "all changed files", "full changed file", and "whole codebase"
are different capabilities. None implies that the entire repository fits in a
single model request.

## 4. Best-fit comparison

Cells below are **documented**, unless marked S. `Pipeline` means the ordinary
review depends on a pipeline; it does not satisfy R1. A provider exposed through
Copilot is not equivalent to accepting that provider's own API key.

| Product | Trigger / optional tasks | Context beyond changes | Inline | Actual PR tab | Providers / credentials | Main gap |
| --- | --- | --- | --- | --- | --- | --- |
| [ADO Pilot](https://marketplace.visualstudio.com/items?itemName=adopilot.adopilot-pr-review) | Service hooks; no pipeline edits | Context-aware claim; retrieval details ? | D | Settings hub documented; review tab ? | Managed Anthropic; credentials encrypted in service | Commercial, no documented broad BYOK or ADO-secret model. |
| [CodeAnt AI](https://marketplace.visualstudio.com/items?itemName=codeantai.codeant-azure-devops-extension) | Project service hooks; optional quality gate, CI scan, coverage tasks | Repository scans; exact review retrieval ? | D | ? | Managed service; CodeAnt/PAT credentials | Closest documented hooks-plus-optional-tasks pattern, not a verified BYOK/ADO-secret solution. |
| [Scrutin](https://marketplace.visualstudio.com/items?itemName=scrutin.scrutin-code-review) | Automatic service-hook setup | AI + static analysis; context mechanism ? | D | D | Pro BYOK claimed; provider/storage details ? | No verified public implementation repository; commercial AI tier. |
| [PR-Agent](https://github.com/The-PR-Agent/pr-agent) | Self-hosted Azure webhook server or pipeline/CLI | Primarily PR/diff context; do not assume arbitrary repository retrieval | D, provider-dependent | Not documented | LiteLLM: OpenAI, Anthropic, DeepSeek and others; host secrets or pipeline secrets | Need native extension UX, ADO-secret execution design, deeper retrieval validation. |
| [Kodus](https://github.com/kodustech/kodus-ai) | Azure Repos webhook service; separate CLI/CI use | Repository/AST context and linked-repo features documented | D | External platform dashboard; native PR tab not established | Broad BYOK / compatible endpoints; service-side credentials | Larger stack; ADO-secret storage not established; AGPL + enterprise exclusions. |
| [Little Fort Copilot Code Review](https://marketplace.visualstudio.com/items?itemName=LittleFortSoftware.ado-copilot-code-review) | Pipeline | CLI can explore checked-out repo | D | Not documented | Copilot / Claude Code; BYOK OpenAI-compatible, Azure, Anthropic; ADO secret variables | GPL; powerful CLI shell access; no default hook service. |
| [ArcLight](https://marketplace.visualstudio.com/items?itemName=ArclightVn.arclight-claude-pr-review) | Pipeline | CLI repository exploration; quick/standard/deep modes | D | Not documented | Anthropic API key or Claude OAuth token in ADO secret variables | GPL; Anthropic-centric; execution permission boundary needs care. |
| [Epsilon AI Assistant](https://marketplace.visualstudio.com/items?itemName=epsilonnet.epsilon-ai-assistant) | Pipeline + manual PR action | D: whole repo through Serena/C# language server | D | PR action, not a proven tab | Claude on Foundry via ADO service connection; OAuth trial alternative | C#-oriented, Linux/Docker worker; no verified public source or all-PR hook onboarding. |
| [Dekiru reviewer](https://marketplace.visualstudio.com/items?itemName=DekiruSolutionsAB.AIPullRequestReview) | Pipeline; unpublished listing | S: read/search/list/history tools across repo | D/S | Not documented | S: OpenAI, Azure, Ollama, custom compatible endpoint; pipeline secrets | No native Anthropic adapter in inspected factory, no webhook UX. |
| [AI-Powered PR Comments](https://marketplace.visualstudio.com/items?itemName=ByteInsights.DevOps-AI-PR-Extension) | Pipeline | Whole PR + work items + human comments + standards; no general repo search demonstrated | D | Not documented | OpenAI, Azure, Anthropic, Gemini, Vertex, Ollama, compatible APIs; ADO secret variables | Strong pipeline baseline, not R1 or verified R3. |
| [OpenCode AI Agent](https://marketplace.visualstudio.com/items?itemName=martin-trojan.OpenCodeAgent) | Pipeline; comment-trigger automation left to user | Local workspace via OpenCode | D | Not documented | OpenCode-supported providers; pipeline environment credentials | S: V1-era SDK/server API, not verified V2 compatible. |
| [AutoCodeReview.ai](https://marketplace.visualstudio.com/items?itemName=LawrenceShen.ai-pr-autoreview) | Pipeline | Diff or complete changed files | D | Not documented | OpenAI, Anthropic, Gemini, Grok, Copilot, compatible APIs; ADO secrets | No general repository retrieval/hook service documented. |
| [SkillFlow](https://marketplace.visualstudio.com/items?itemName=SimoneBittiDev.skillflow-pr) | Pipeline | Agent can request file content | D | Not documented | Claude, OpenAI, Azure, Ollama; ADO variable groups | Python; public repo has no detected license; write-capable tools need restriction. |
| [Universal AI PR Reviewer](https://marketplace.visualstudio.com/items?itemName=AhsanKhanDGE.universal-ai-pr-reviewer) | Pipeline; unpublished | PR metadata + changes | File threads D; precise line anchors ? | Cross-project dashboard, not proven PR tab | OpenAI/Azure/Foundry/Claude/DeepSeek/vLLM/custom REST; pipeline key input | Appealing provider/dashboard design; no verified source repository or R1. |
| [Agentic Code Reviewer](https://marketplace.visualstudio.com/items?itemName=InnovaApps.azure-repos-pr-reviewer) | User runs review from PR | Full changed files + linked work items + repo index + agent reads | D, user-approved | D: AI Review | OpenAI, Azure, Anthropic, managed Claude; keys in Google Secret Manager | Manual, commercial, keys not ADO secrets; index/embeddings involve additional data processors. |
| [Guided PR Review](https://marketplace.visualstudio.com/items?itemName=Antonioumak.guided-pr-review) | Pipeline populates PR property | Diff, flow diagrams, work-item acceptance criteria | D: native human threads in custom diff UI | D: Guide | Anthropic; secret pipeline key | Guide/understanding workflow, not a complete autonomous reviewer; no verified own source repo. |
| [AI-assisted PR Review](https://marketplace.visualstudio.com/items?itemName=DmitryRozenraukh.devops-ai-pr-review) | PR hub + self-hosted backend; unpublished | Backend-driven; scope ? | Publish support D; precise anchors ? | D: AI Review | Local / Azure OpenAI; backend environment | Promising public UI/backend reference, not documented organization-wide hooks. |

### Language detection

The clearest small implementation reference is Rachit Singhal's family:
[OpenAI bot source](https://github.com/rs-001-ai/ai-code-review-extension/blob/master/tasks/AICodeReviewTask/ai-code-review.py)
maps file extensions to skill references and detects framework patterns. Its
[Copilot listing](https://marketplace.visualstudio.com/items?itemName=RachitSinghal.copilot-code-review-bot)
explicitly documents the same approach and central cross-repository build
validation. This is heuristic routing, not AST-level language identification.
The inspected Python mapping groups Kotlin/Scala with Java and TypeScript with
JavaScript, and contains repeated JSX/TSX keys. Do not copy it as a complete
language classifier. Other products' language-count claims do not establish R6.

### Conversation and continuing review (R10/R11)

**Added requirement:** the reviewer should answer the PR author's comments and
continue the same review when new commits arrive. These are two separate event
paths: a question need not trigger a complete PR analysis, while a new commit
must trigger re-review and reassessment of existing findings.

Reading human comments as prompt context is **not** proof of answering them.
Deduplicating repeated comments is **not** proof of verifying and resolving fixes.
The following is documentary evidence, not a runtime comparison:

| Product | Author-comment interaction | New commits / existing findings |
| --- | --- | --- |
| [PR-Agent Azure webhook integration](https://docs.pr-agent.ai/installation/azure/) | Explicit Azure support for commands and identity mentions; replies in the same thread using its discussion. Automatic response to an unmentioned author reply is not established. | Can be triggered through webhook/automation; exact Azure finding reconciliation and resolution behavior still needs validation. Do not assume conversational support implies R11. |
| [CodeRabbit Azure integration](https://docs.coderabbit.ai/platforms/azure-devops) | Interactive bot addressed through its configured identity; comment service hook documented. | Created/updated hooks documented; Azure-specific thread reconciliation/resolution needs a focused trial. |
| [CodeAnt Azure setup](https://docs.codeant.ai/setup/azure_devops/cloud/pull_request) | Interactive PR Q&A; a separate comment subscription delivers questions and commands. | New-PR reviews and explicit rerun command documented; full push/reconciliation semantics not established by this setup page. |
| [Kodus Azure hooks](https://docs.kodus.io/en/how_to_deploy/platforms/azure_devops/azdevops_webhook.md) | Comment events supported; distinguish commands from automatically answering ordinary thread replies in an Azure-specific test. | Created/updated subscriptions documented; verify stable finding identity, human dismissals and automatic resolution separately. |
| [ArcLight](https://github.com/viettdann/arclight-ado-claude-pr-review) | Replies to relevant existing threads during a re-review; this does not establish a comment-event-triggered conversation service. | Explicitly documents resolving fixed bot findings, replying when moved but not fixed, leaving untouched findings alone, updating one summary and respecting closed threads. Strong R11 reference. |
| [Little Fort](https://github.com/little-fort/ado-copilot-code-review) | Uses existing threads as context; automatic question-triggered replies not documented. | Pipeline re-review, addressed-thread resolution, `agentOnly` ownership mode, and incremental new feedback documented. Use `agentOnly` rather than its broader default for our intended policy. |
| [Byte Insights](https://github.com/JackInSightsV2/AzDevOps-PR-AI-Comments) | Uses human comments as context; no documented automatic conversation trigger. | Fingerprinted findings, summary updated in place, and no-longer-applicable findings auto-closed. Validate that omitted/unreviewed findings cannot be mistaken for fixes. |
| [Biswajit V2](https://marketplace.visualstudio.com/items?itemName=Biswajit.copilot-pr-review-v2) | Existing-thread context; conversational event handling not established. | Advertises resolving prior fixed Copilot comments on subsequent builds; exact V2 source remains unverified. |
| [ADO Pilot](https://marketplace.visualstudio.com/items?itemName=adopilot.adopilot-pr-review) | Author-question handling not established. | PR-created/updated service hooks documented; precise finding reconciliation/resolution not established. |

This strengthens PR-Agent's case for conversational investigation and makes
ArcLight/Byte Insights particularly useful lifecycle references. It does not yet
establish that one candidate meets both requirements completely. The proposed
trigger, reply and resolution rules are in
[architecture section 1](architecture-and-next-steps.md#1-an-extension-is-not-an-always-running-llm-host).

## 5. The original nine candidates

### 5.1 GPT Pull Request Review JP

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=kohta-jrits.gpt-pr-review-jp)
  / [repository](https://github.com/kohta-jrits/azure-pipeline-gpt-pr-review-jp).
- Public **MIT TypeScript** fork of `mlarhrouch/azure-pipeline-gpt-pr-review`.
- Pipeline task, OpenAI **and Azure OpenAI**, Japanese review output, PR comments.
  It does not register organization-wide review hooks.
- Useful for localization and the older task lineage, not the strongest engine
  baseline. Last public repository push observed: 2025-06-23.
- README still links to upstream Marketplace/support. That is documentation
  drift, not evidence the two published packages are identical.

### 5.2 Lena Code Review Assistant

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=LenaSoftware.LenaCodeReviewAssistant).
- Pipeline task using OpenAI, selectable model, file inclusions/exclusions, and
  a pipeline-provided prompt. The example suppresses non-actionable feedback
  with `NO_COMMENT`.
- Own public implementation repository not found. Broad repository retrieval,
  an actual review tab, and file/line anchors are not established by the listing.
- Treat API-key input as requiring a secret variable; a plain task input alone
  does not prove secure storage.

### 5.3 Open AI Code Review ASI FORK

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=AdvancedSolutionsInternational.284d5855-4a99-6ec0-a674-45a69a8683ae).
- OpenAI pipeline task with bugs/performance/best-practice switches, model,
  file filters, and additional prompts.
- It links to [Aidan Cole's upstream](https://github.com/a1dancole/OpenAI-Code-Review),
  **not a verified ASI fork repository**. Own fork source/license not established;
  this is more precise than assuming the upstream code is the published fork.
- Its example embeds a key-shaped literal. Do not reproduce that setup; use
  ADO secrets, regardless of whether the sample value is only a placeholder.

### 5.4 Claude Code Review - John Seong

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=JohnSeong.claude-code-review)
  / [user-corrected repository reference](https://github.com/sandole/claude-code-review-ado).
- **Input provenance:** the user had already updated the repository URL in the
  supplied list after noticing a different repository reference in the publisher's
  description. Preserve that correction; do not treat the earlier reference and
  this URL as interchangeable. The earlier URL was not recorded in this survey.
- This specific corrected URL **returned HTTP 404 anonymously**. It could be
  private, moved, or deleted; we cannot establish which. This does not prove that
  every alternative repository reference for the extension is unavailable.
- Listing: pipeline task, Anthropic API key in secret variable group, confidence
  threshold, model and file limit, noise suppression, summary PR comment.
- A file/line reference in its sample summary is not proof of an inline thread.
  Listing says MIT, but reusable source/license could not be checked.
- The install link also names another publisher. Resolve identity drift before
  using this as a foundation.

### 5.5 ADO Pilot - AI PR Review

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=adopilot.adopilot-pr-review)
  / [setup](https://adopilot.dev/getting-started).
- **Good R1 reference**: onboarding registers service hooks; new/updated PRs
  trigger hosted reviews without pipeline changes. Repo selection is explicit.
- Inline findings, suggested fixes, second-pass verification, and an
  `adopilot/ai-pr-review` PR status usable as a required branch policy.
- Managed Anthropic processing; usage-credit commercial plans/trial. No public
  implementation repository found. Encrypted vendor credentials do not establish
  ADO-native secret storage or broad BYOK.
- Future repositories/projects still need a coverage check; "every PR" should
  be read in the scope of configured repositories and accessible projects.

### 5.6 ArcLight Claude PR Review

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=ArclightVn.arclight-claude-pr-review)
  / [repository](https://github.com/viettdann/arclight-ado-claude-pr-review).
- Public JavaScript/Node 24 task, **GPL-3.0-or-later**. Claude Code CLI, Anthropic
  API key or subscription OAuth token, ADO system token; Services only documented.
- Repository exploration, linked Boards work items, quick/standard/deep review,
  optional diff-only mode, custom prompts, budgets/turn/time limits, severity
  controls, one updated summary, incremental review and thread reconciliation.
- Particularly good documentation about permission boundaries and prompt
  injection: `git push` denial is not a security boundary when REST writes remain
  possible. Pipeline output is sanitized against logging-command injection.
- No own public hook service or PR tab documented. Verify Marketplace version
  versus current repository before assuming all README features are shipped.

### 5.7 Copilot PR Review V2 - Biswajit

- [V2 Marketplace](https://marketplace.visualstudio.com/items?itemName=Biswajit.copilot-pr-review-v2).
- Listing advertises Copilot CLI installation, full PR diff/metadata/existing
  threads, inline comments, resolving prior bot findings, custom prompt/file,
  model/timeout/author filters, system token or PAT, Server support.
- **Important source mismatch**: V2 links to
  [biswajitsamal59/copilot-pr-review](https://github.com/biswajitsamal59/copilot-pr-review),
  which returned 404. The user's
  [ado-copilot-code-review repository](https://github.com/biswajitsamal59/ado-copilot-code-review)
  is public, GPL-3.0, and its README describes the **older**
  [Copilot PR Review listing](https://marketplace.visualstudio.com/items?itemName=Biswajit.copilot-pr-review),
  now marked unpublished.
- Older README says general comments only; V2 advertises inline comments. Do not
  attribute the V2 implementation to the accessible older repository without proof.
- Broad `allow-all` CLI permissions and denial of one push command are not hard
  isolation. Copilot access is not arbitrary-provider BYOK.

### 5.8 Code Review Bot - Rachit Singhal

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=RachitSinghal.code-review-bot)
  / [repository](https://github.com/rs-001-ai/ai-code-review-extension).
- Public MIT repository, default branch **master**, Python review logic with
  TypeScript task wrapper. A 404 for `main/README.md` would be a false negative.
- OpenAI task; language/framework skills, security/performance rules, file/line
  caps, summary and inline comments, configurable model/debug/error behavior.
- Selected source inspection: collects changed-file contents, truncates them,
  and sends one review request; inline critical/high findings are parsed from
  Markdown with a regex. It is not an unchanged-code repository search agent.
- README describes diffs, but the inspected path fetches complete changed files
  and labels them as diff content. Verify actual packaged behavior and anchoring.
- Separate [Copilot edition](https://marketplace.visualstudio.com/items?itemName=RachitSinghal.copilot-code-review-bot)
  documents explicit language routing, framework heuristics, API fallback, and
  **central cross-repository validation**, useful for avoiding per-repo YAML edits.

### 5.9 AI Claude Code Review Task - Maciej Tubek

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=MaciejTubek.ai-code-review-claude)
  / [repository](https://github.com/mtubek/azure-devops-ai-code-review-claude).
- Public MIT TypeScript fork of
  [Tommi Laukkanen's Azure OpenAI task](https://github.com/tlaukkanen/azure-devops-ai-code-review).
- Native Anthropic API-key task, configurable model, whole-diff-at-once option,
  bug/performance/best-practice switches, file filters, extra prompts, token limits,
  configurable token rates and optional cost displayed in comments.
- Pipeline/branch policy integration, not service hooks. Whole diff does not
  establish whole-repository context. README has inherited install/support links;
  validate task names and package identity before trial.

## 6. Additional feature-bearing products

The full [inventory](marketplace-inventory.md) includes separate identities and
historical forks. The following are the useful differences, rather than treating
every republished GPT wrapper as a distinct architecture.

| Product / source | Documented features worth learning from | Important qualification |
| --- | --- | --- |
| [Little Fort](https://github.com/little-fort/ado-copilot-code-review) | Full-repo CLI exploration, linked Boards/Jira context, custom-provider BYOK, severity/noise caps, incremental comments, agent-only resolution, cost/turn limits, inline fallback. | GPL; shell-capable agent. Diff-only mode is not a hard sandbox. |
| [Byte Insights](https://github.com/JackInSightsV2/AzDevOps-PR-AI-Comments) | Whole-PR analysis, related work items/comments/standards, structured output, confirm/drop pass, batching+synthesis, fingerprint deduplication, stale finding closure, optional static comments. | MIT; advisory `SucceededWithIssues`, not a security gate; no general repo retrieval demonstrated. |
| [AutoCodeReview.ai](https://github.com/lawrence8358/AI-PR-AutoReview) | Six provider routes including compatible endpoints, prompt-file/inline/built-in modes, response language, incremental/full-file modes, structured inline JSON and grouping. | MIT; content/prompt logging is documented as enabled by default in listing; review privacy before enabling. |
| [Dekiru](https://github.com/dekirusolutions/azure-pipeline-pr-review) | Repository tools, review coverage tracker, bounded tool loop, context compaction, PR/file/line findings, status checks and comment cleanup. | MIT; listing unpublished; inspected provider factory uses OpenAI protocol, not native Anthropic. Do not enable its global TLS-verification bypass. |
| [OpenCode AI Agent](https://github.com/trojanmartin/opencode-azdo-extension) | Workspace-based review, custom agents/models, review/command modes, posting helper, reusable central task. | MIT; source imports `@opencode-ai/sdk` and old `session.prompt`/`app.log` APIs. Treat V2 support as an explicit migration spike. |
| [Gen AI Advanced PR Reviewer](https://marketplace.visualstudio.com/items?itemName=abozar.GenAIAdvancedPRReviewer) / [source](https://github.com/abozaralizadeh/azure-pipeline-gpt-pr-review) | Staged context/file/security/suggestion/final-assessment workflow; confidence/call budgets; MCP external context; replaceable prompts/rules/templates; inline ranges. | Azure OpenAI pipeline; current docs describe structured orchestration, while title/metadata still say LangGraph. Check current source rather than inferring framework. |
| [Azure DevOps PR Agent](https://github.com/Mohammad-AlRousan/Azure-DevOps-PR-Agent) | Describe/review/improve/tests/security/compliance/ask/auto-approve analysis modes, distinct PR comments. | MIT; unrelated to community PR-Agent despite similar name; Azure OpenAI pipeline. Auto-approval requires separate risk assessment. |
| [LLM PR Reviewer](https://github.com/nitta-a/az-pipeline-AI-review) | Azure/OpenAI/Anthropic/AWS Bedrock advertised, extracts PR diff and posts review comments. | Pipeline; broad providers, not verified whole-repo context or inline anchors. |
| [PR Reviewer with Azure OpenAI GPT](https://marketplace.visualstudio.com/items?itemName=tw-developer.GPTPRReviewer) | Despite the old name, current description advertises OpenAI, Azure, Anthropic, Gemini **and DeepSeek**, editable system prompt, and 22 response languages. | Pipeline; response-language choices are not per-file programming-language detection. Own fork source not established; upstream linked. |
| [Epsilon AI Assistant](https://marketplace.visualstudio.com/items?itemName=epsilonnet.epsilon-ai-assistant) | Serena/C# language-server repository exploration, inline dedup/resolution, Foundry service connection, PR action; model container separated from ADO-token publishing steps. | Pipeline and Linux/Docker required; no public implementation repo found. Strong isolation/context/service-connection reference, not broad BYOK proof. |
| [AI PR Reviewer AT](https://marketplace.visualstudio.com/items?itemName=AniketTiwari.ai-pr-reviewer-at) | Azure Functions **service-hook backend**, created/updated events, configurable depth/focus and draft modes, Azure OpenAI. | Manual hook/backend deployment; clone URL is a placeholder, not a verified public repository. Managed identity/environment design differs from ADO-secret storage. |
| [GN OpenAI Code Review](https://marketplace.visualstudio.com/items?itemName=gn-group.open-ai-code-review) | Severity-based issue caps, prior-comment context/resolution tracking, exponential retry, customizable templates and before/after fixes. | Pipeline Azure OpenAI; no verified public implementation repo. |
| [Code Whisper](https://marketplace.visualstudio.com/items?itemName=JumpInnovations.JumpCodeWhisper) / [linked source](https://github.com/michel-jump/azure-pipeline-ai-pr-review) | OpenAI/Anthropic choice, custom instruction prompt, PR-change review and comments. | Pipeline; separate older JumpWhisper/AIPRReview IDs have unavailable description assets. |
| [Claude AI Code Review](https://github.com/tsmshvenieradze/ClaudeCodeReview) | **Anthropic service connection**, direct secret-key alternative, inline+summary, deduplication, file globs, full changed-file context, optional fail-on-critical, Services/Server. | Useful R8 example; listing incorrectly suggests YAML `pr:` works for Azure Repos cloud. Use branch policies instead. |
| [PRIA](https://github.com/ewellnitz/pr-inspection-assistant) | OpenAI/Azure, modified-lines-only, focus switches, file filters, extra prompts; explicit correct branch-policy instructions. | Pipeline; many near-identical republishings; avoid double-counting as independent engines. |
| [Azure OpenAI Code Reviewer](https://github.com/Ruben-Nintex/aoai-review) | Incremental changed-file tracking, old-review cleanup, custom instructions, binary exclusion, multiple agent OSes. | Pipeline; "context aware" means diff context here, not demonstrated repo-wide retrieval. |
| [AISRE](https://marketplace.visualstudio.com/items?itemName=AISRE.pr-review) | Learns rules from resolved human comments; admin approval, provenance, audits, scopes, explicit tags, avoids learning from itself. | Public repo is docs/license only; **proprietary license**. Key encryption in Extension Data Service is not an ADO secret variable/service connection. |
| [Guided PR Review](https://marketplace.visualstudio.com/items?itemName=Antonioumak.guided-pr-review) | Narrative chapters, before/after flows, moved-code detection, file-reviewed ticks reset after changes, attention rules, acceptance criteria, critical-file status. | Native PR tab; pipeline stores guide in PR property. Inspiration repo credited is not its own implementation. |
| [Agentic Code Reviewer](https://marketplace.visualstudio.com/items?itemName=InnovaApps.azure-repos-pr-reviewer) | Draft findings for human approval, exact failure scenarios, confirmation labels, per-iteration cache, repo index, provider selection and cost visibility. | Manual hosted reviews; Google Secret Manager/Firestore and OpenAI embeddings, even when another provider generates review. |
| [GitHub Copilot Code Reviewer](https://marketplace.visualstudio.com/items?itemName=InnovaAppsGH.azure-repos-pr-reviewer) | PR AI Review UI, Copilot-powered findings, draft approval/publishing. | Separate commercial preview; do not assume all InnovaApps product features are shared. |
| [Scrutin](https://marketplace.visualstudio.com/items?itemName=scrutin.scrutin-code-review) | Auto hooks + actual PR tab + hub; AI plus static checks, secrets/IaC, small comment cap, fix suggestions. | Listing says MIT, but no public own implementation repository was located; AI/ADO features are paid-tier claims. |
| [Azent](https://marketplace.visualstudio.com/items?itemName=azent-tech.azent-devops-extension) | PR action-triggered reviews/fixes, inline+summary, PR Runs tab with streaming status/logs, work-item implementation. | Manual action is not automatic all-PR hooks; coding-agent write permissions exceed review-only needs. |
| [AI-assisted PR Review](https://github.com/rosenbom/DevOpsAIPRReview) | Native AI Review hub, separate Docker backend, local/Azure OpenAI flows, publish step. | Listing unpublished; backend secrets not ADO-native; inspect license and transport before reuse. |
| [Universal AI PR Reviewer](https://marketplace.visualstudio.com/items?itemName=AhsanKhanDGE.universal-ai-pr-reviewer) | Broad BYOK including DeepSeek, confidence/severity JSON, summary/file threads, stale PR cross-project dashboard. | Unpublished; architectural file tree is not proof the implementation is open source. |
| [AI Code Review Unified](https://marketplace.visualstudio.com/items?itemName=OngWaiKiat.ai-code-review-unified) | Git PR **and TFVC shelveset** review, Gemini/Ollama, multiple key/model retry. | Pipeline; predecessor Gemini/self-hosted listings are unpublished; placeholder GitHub links are not source evidence. |
| [Ollama Code Reviewer](https://github.com/teriansilva/azure-devops-ollama-code-reviewer) | Local/on-prem models, no required hosted AI provider, configurable review focus and files. | Public TypeScript source; no detected license/accessible root LICENSE in this check. A downstream MIT claim is insufficient. |
| [Ubiquity AI PR Reviewer](https://marketplace.visualstudio.com/items?itemName=ubiquityai.ubiquity-ai-pr-review) | Extends Ollama lineage with compatible API endpoints and BYOK/local operation. | Listing credits upstream MIT, but upstream licensing must be resolved independently before copying. |
| [Fairmas](https://marketplace.visualstudio.com/items?itemName=FairmasGmbH.AIPullRequestReview) | Ollama-hosted LLM review inside pipeline; predecessor supports Azure-hosted/OpenAI models. | Own source not established; upstream links alone do not prove exact fork availability. |
| [Paybyrd](https://github.com/luizfdias/OpenAI-Code-Review) | OpenAI and Claude task variants, configurable focuses/prompts/files. | Own linked fork; older `pbopenai` identities are separate/historical. |
| [Fastronome AI task](https://github.com/fastronome/azure-devops-ai-code-review) | Task lineage with API-based review, summary/customization and cost-oriented settings. | Separate from [Fastronome Copilot task](https://github.com/fastronome/azure-devops-copilot-code-review); both are pipeline-based. |
| [AI Azure DevOps PR](https://github.com/pepelepew/AIAzureDevOpsPR) | Markdown system/user prompts, generated diff, response file export, optional PR posting, non-PR diff analysis. | Build/Extensions output is not established to be a native PR review tab. |
| [Cody Pro](https://marketplace.visualstudio.com/items?itemName=codylabs.cody-pro-review) | BYOK Anthropic/OpenAI, generated summary and review thread, dependency-directory exclusion, agent-local execution. | Paid license **and pipeline required**; public GitHub Action/issue repo does not make ADO Pro open source. |
| [CI&T Flow](https://marketplace.visualstudio.com/items?itemName=ciandt-global.flow-code-reviewer) | Pipeline-connected review through Flow, selectable service/model/prompt settings in product documentation. | Vendor service and credentials; test publisher is a separate unpublished listing. |
| [Panto](https://marketplace.visualstudio.com/items?itemName=pantodev.panto-code-review) | ADO code-review integration is listed. | Listing contains little beyond documentation/pricing links; broad claims need vendor verification. |
| [Diffsift](https://marketplace.visualstudio.com/items?itemName=tamedeveloper.diffsift) | Windows local model review packs, evidence/confidence, opt-in PR polling, multipass profiles, DPAPI PAT storage. | Desktop app advertised through Marketplace, not an ADO-hosted review engine; never posts comments; commercial trial/license. |

## 7. Relevant products outside the extension catalogue

| Product | Why include it | Fit and limits |
| --- | --- | --- |
| [Community PR-Agent](https://github.com/The-PR-Agent/pr-agent) / [Azure setup](https://docs.pr-agent.ai/installation/azure/) | Public MIT code, Azure webhook server and pipeline/CLI, LiteLLM provider breadth, describe/review/improve/ask. | Manual webhook provisioning or custom onboarding; verify Azure provider support per command. Not the commercial Qodo product. |
| [Kodus](https://github.com/kodustech/kodus-ai) / [Azure hooks](https://docs.kodus.io/en/how_to_deploy/platforms/azure_devops/azdevops_webhook.md) | TypeScript/NestJS webhook/API/worker/web platform, BYOK, repo context, rule inheritance, linked repos, self-hosting. | AGPL core; `.ee.`/`ee/` files commercially licensed. Existing secrets live with service, not verified in ADO. |
| [Qodo Review](https://docs.qodo.ai/install-qodo/azure-devops) | Entra/PAT onboarding, auto hooks, organization/project/repo selection, context engine, PR history and cross-repo discovery. | Commercial platform, not the MIT PR-Agent repository. No assumption of feature parity or interchangeable licenses. |
| [CodeRabbit](https://docs.coderabbit.ai/platforms/azure-devops) | Service-hook reviews, inline suggestions, conversational bot, PAT or Entra service-principal onboarding, bulk webhook setup. | Closed review engine; ADO documentation explicitly distinguishes its **commit status** from a PR status usable by a PR status policy. |
| [Smart PR Review](https://marketplace.visualstudio.com/items?itemName=FabianReyes.smart-pr-review) | Human-approved AI drafts, multiple CLI engines, base-branch profiles, isolated review worktrees. | **VS Code extension**, not an Azure DevOps-installed server extension. Local IDE credentials, not ADO secrets. |

These external integrations are a deliberately bounded comparison, not a complete
catalogue of every SaaS claiming Azure DevOps support. Do not infer support from
a vendor's GitHub feature list or competitor-comparison blog.

## 8. Reuse/contribution shortlist and license findings

GitHub availability and primary-language/license metadata were checked on the
research date. A push date is an activity hint, not a release date or quality score.

| Repository | Language / license | Observed last push | Suggested role |
| --- | --- | --- | --- |
| [The-PR-Agent/pr-agent](https://github.com/The-PR-Agent/pr-agent) | Python / MIT | 2026-10-19 | First contribution candidate if Python service is acceptable. Add native ADO onboarding/report UI rather than duplicate its adapters. |
| [kodustech/kodus-ai](https://github.com/kodustech/kodus-ai) | TypeScript / AGPL core + commercial enterprise exclusions | 2026-10-19 | First TypeScript platform evaluation; validate license and deployment appetite. |
| [dekirusolutions/azure-pipeline-pr-review](https://github.com/dekirusolutions/azure-pipeline-pr-review) | TypeScript / MIT | 2026-09-07 | Small tool-loop/coverage implementation reference; potential collaboration despite unpublished listing. |
| [JackInSightsV2/AzDevOps-PR-AI-Comments](https://github.com/JackInSightsV2/AzDevOps-PR-AI-Comments) | TypeScript / MIT | 2026-07-09 | Provider/output/comment-lifecycle reference; add retrieval rather than claim existing whole-repo awareness. |
| [trojanmartin/opencode-azdo-extension](https://github.com/trojanmartin/opencode-azdo-extension) | TypeScript / MIT | 2026-04-15 | Contribute V2 migration and safe review mode; validate before reuse. |
| [lawrence8358/AI-PR-AutoReview](https://github.com/lawrence8358/AI-PR-AutoReview) | TypeScript / MIT | 2026-07-18 | Small broad-provider pipeline baseline. |
| [little-fort/ado-copilot-code-review](https://github.com/little-fort/ado-copilot-code-review) | PowerShell / GPL-3.0 | 2026-08-21 | Mature workflow reference or upstream contribution; not silently MIT-reusable. |
| [viettdann/arclight-ado-claude-pr-review](https://github.com/viettdann/arclight-ado-claude-pr-review) | JavaScript / GPL-3.0-or-later | 2026-09-17 | Review lifecycle, prompts and safety lessons; respect copyleft. |
| [rs-001-ai/ai-code-review-extension](https://github.com/rs-001-ai/ai-code-review-extension) | Python + TS wrapper / MIT | 2026-02-01 | Small language-skill and ADO comment reference, not an agentic repo retriever. |
| [mtubek/azure-devops-ai-code-review-claude](https://github.com/mtubek/azure-devops-ai-code-review-claude) | TypeScript / MIT | 2026-02-03 | Anthropic task adapter and cost reporting. |
| [mlarhrouch/azure-pipeline-gpt-pr-review](https://github.com/mlarhrouch/azure-pipeline-gpt-pr-review) | TypeScript / MIT | 2023-09-13 | Important upstream lineage, older baseline; original listing unpublished/locked. |
| [simonebittidev/azure-devops-skillflow](https://github.com/simonebittidev/azure-devops-skillflow) | Python / license not detected | 2026-10-09 | Learn architecture; request explicit license before copying/distributing. |
| [aisre-labs/pr-review](https://github.com/aisre-labs/pr-review) | Docs / proprietary license | 2026-04-20 | Product feature reference only; not an open-source foundation. |
| [teriansilva/azure-devops-ollama-code-reviewer](https://github.com/teriansilva/azure-devops-ollama-code-reviewer) | TypeScript / no license detected in check | 2026-02-11 | Resolve licensing before reuse. |

GPL/AGPL projects are legitimate contribution candidates. Whether incorporating
their code into a separately distributed extension/service is acceptable needs
a deliberate license decision. A public repo with no license does not grant a
general right to copy, modify, and redistribute. These are screening notes, not
legal advice.

### Selected implementation inspection trail

These are the specific implementation files read, not claims of a complete audit:

| Source | Observed implementation / question it answers |
| --- | --- |
| [Dekiru agent loop](https://github.com/dekirusolutions/azure-pipeline-pr-review/blob/main/GPTPullRequestReview/src/agent/loop.ts) | Bounded tool iterations, parallel read-only calls, coverage tracker, history compaction and reporting pending files when exhausted. |
| [Dekiru provider factory](https://github.com/dekirusolutions/azure-pipeline-pr-review/blob/main/GPTPullRequestReview/src/provider.ts) | OpenAI/Azure/Ollama/custom-compatible clients; no native Anthropic route in this factory; optional global TLS bypass to avoid adopting. |
| [OpenCode task runtime](https://github.com/trojanmartin/opencode-azdo-extension/blob/main/src/opencode.ts) | Spawns a server, imports `@opencode-ai/sdk`, uses old session/app APIs and event subscription; a concrete V2 migration surface. |
| [Rachit OpenAI review logic](https://github.com/rs-001-ai/ai-code-review-extension/blob/master/tasks/AICodeReviewTask/ai-code-review.py) | Language/framework skill routing, changed-file content fetching/truncation, one model request, regex-derived inline comments. |

Links to default branches can change after the research date. Pin source commits
and compare packaged task contents before a reproduction or reuse decision.

## 9. Features to consider beyond the original requirements

1. **Evidence-backed findings**: exact code/version, failure scenario, severity,
   confidence and verification status. Separate speculation from confirmed issues.
2. **Continuing review (required, R10/R11)**: answer author replies in-thread;
   automatically re-review new commits; use stable finding IDs; update one
   summary; verify fixes and reconcile only bot-owned threads; preserve human
   dismissals and never resolve human discussion by default. A comment-only
   question should not require a dummy commit or necessarily a whole-PR rerun.
3. **Transparent coverage**: changed/inspected/skipped files, truncation, incomplete
   runs, current head SHA, model and rules version. A timeout is not a clean review.
4. **Budget controls**: token/turn/time/cost caps, per-repo quotas, debounce pushes,
   cancel obsolete runs, incremental mode, no silent cross-provider failover.
5. **Repo/work-item context**: acceptance criteria, ADRs, dependency contracts,
   target-branch trusted instructions, optional linked-repository access.
6. **Human-approved draft publication**: useful pilot mode before autonomous inline
   comments or policy gates. Never silently approve or merge.
7. **Narrative guide**: intent, architecture impact, before/after flow, suggested
   reading order and testing checklist in the PR tab.
8. **Governed learning**: opt-in learning from human feedback, provenance and admin
   approval; never train rules from the bot's own output.
9. **Security integration**: deterministic secret/SAST/IaC checks complement LLM
   findings; surface tool provenance rather than call every warning an AI finding.
10. **Operational onboarding**: test hook delivery, permissions and provider access;
    coverage of new repos/projects; key rotation; installation/uninstallation cleanup.

The main unresolved design decisions and a small, comparable evaluation plan are
in [architecture and next steps](architecture-and-next-steps.md).

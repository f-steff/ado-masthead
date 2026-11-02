# Marketplace inventory: Azure DevOps AI PR reviewers

Research date: **2026-10-20**. Read the
[landscape comparison](ai-pr-review-landscape.md) first for recommendations.

The landscape also compares the added requirements for **answering author
comments** and **automatic re-review with finding resolution**. Reading comments
as context, accepting a rerun command, and actually answering a reply are distinct
features; none should be inferred from "automated PR review" alone.

## Reading this catalogue

This preserves the **306 candidate identities** from the broad discovery query,
including rejected results, rather than hiding the many forks and stale records.
It is not a count of active products. There are:

- **118** relevant candidates with a successfully retrieved description, not
  marked unpublished (`D`). Some descriptions are sparse or inherited.
- **98** relevant identities marked unpublished (`U`); retained for source/history.
- **67** identities with unavailable/missing description assets (`?`); no claim
  that these can currently be installed or that their features match a sibling.
- **23** out-of-scope/adjacent search results (`X`).

**Diffsift** is an additional, separately discovered relevant listing. External
integrations and VS Code-only tools are discussed in the landscape document.

`D` is documentary evidence, not a successful installation or security audit.
`U` comes from the Gallery `unpublished` flag, not merely an old update date.
For `?`, some metadata is public but its description asset returned 404 or lacked
a usable URI. Neither a `public` flag nor version metadata proves availability.

### Marketplace links and source references

The exact item ID is important; similar titles often refer to different packages.
For compact historical/unavailable rows, append the ID to:

`https://marketplace.visualstudio.com/items?itemName=`

The main and current-product rows include direct links. Repository links below
are **references found in public descriptions or metadata**, not proof that the
repository contains that publisher's exact packaged source. In particular:

- `upstream` is not the publisher's verified fork.
- `linked` is not independently audited for availability/license/package parity.
- `not found` means no own public implementation repository was established.
- Dependency, screenshot, GitHub token-settings and placeholder repository links
  were excluded as source evidence.
- See the landscape's license table for the repositories actually checked.

### Shared feature profiles

These avoid repeating the same inherited README dozens of times. Each row's
note narrows the profile where a fork documents a difference. The profile is
**only the documented baseline**, not a claim of binary/source equivalence.

| Profile | Documented baseline |
| --- | --- |
| G | GPT/AI PR task family: pipeline execution, changed-code review, feedback as PR comments; OpenAI and/or Azure OpenAI configuration in this family; Build Service/system-token permissions. No general repository search, native PR tab or background hook service established from that baseline. |
| O | OpenAI Code Review family: pipeline task, model and file filters, bugs/performance/best-practice focus switches, additional prompts, PR feedback. Typical baseline is OpenAI; Azure/Claude differences are called out separately. |
| I | PRIA family: pipeline, OpenAI/Azure, modified-lines option, review-focus switches, file exclusions and extra prompts, PR feedback. A republishing is not automatically an independent implementation. |
| A | Gen AI Advanced PR Reviewer family: Azure OpenAI pipeline, staged context/file/security/suggestions/assessment, confidence and call limits, inline/file/summary feedback. Newer upstream docs add MCP and custom rules/templates; not verified in every fork/version. |
| C | Copilot CLI task family: pipeline invokes a CLI with PR/workspace context and posts feedback; model choice through Copilot. Do not infer arbitrary-provider BYOK, exact inline support, or strong sandboxing from the family name. |
| L | Local-model task: pipeline sends changes to Ollama or a compatible endpoint. Reachable model server still required; not inference hosted inside ADO. |
| Specific | Distinct features are stated in the row and/or detailed in the landscape. |
| Unknown | Only metadata/title or an insufficient description exists. No inherited feature assumptions. |

## 1. Retrieved descriptions, not marked unpublished (D)

### A-H

| Extension | Features / qualification | Public repository reference |
| --- | --- | --- |
| [13eSolution.GenAIAdvancedPRReviewer13eFork](https://marketplace.visualstudio.com/items?itemName=13eSolution.GenAIAdvancedPRReviewer13eFork) | A; branded 13e fork. | [GenAI upstream][genai] |
| [97Saundersj.AIPullRequestReview](https://marketplace.visualstudio.com/items?itemName=97Saundersj.AIPullRequestReview) | G; OpenAI/Azure, Linux/macOS execution documented. | [linked source](https://github.com/97saundersj/azure-pipeline-ai-pr-review) |
| [abozar.GenAIAdvancedPRReviewer](https://marketplace.visualstudio.com/items?itemName=abozar.GenAIAdvancedPRReviewer) | A; current docs describe MCP context and replaceable prompts/rules/templates. | [source][genai] |
| [abozar.GenAIAdvancedPRReviewerBeta](https://marketplace.visualstudio.com/items?itemName=abozar.GenAIAdvancedPRReviewerBeta) | A; beta identity; do not assume stable package parity. | [linked source][genai] |
| [adopilot.adopilot-pr-review](https://marketplace.visualstudio.com/items?itemName=adopilot.adopilot-pr-review) | Automatic service hooks, inline comments, second pass, PR status; managed Claude, commercial. | Own source not found. |
| [AdrianGonzalez.agaprai](https://marketplace.visualstudio.com/items?itemName=AdrianGonzalez.agaprai) | I; PR AI-branded PRIA description. | Description references PRIA assets; own fork not found. |
| [AdvancedSolutionsInternational.284d5855-4a99-6ec0-a674-45a69a8683ae](https://marketplace.visualstudio.com/items?itemName=AdvancedSolutionsInternational.284d5855-4a99-6ec0-a674-45a69a8683ae) | O; ASI fork; own source not established. | [OpenAI upstream][oaicr] |
| [aiazuredevopspr.AIAzureDevOpsPR](https://marketplace.visualstudio.com/items?itemName=aiazuredevopspr.AIAzureDevOpsPR) | Azure OpenAI pipeline; Markdown prompts, auto-diff, response file, optional PR comments. | [linked source](https://github.com/pepelepew/AIAzureDevOpsPR) |
| [AidanCole.oaicr](https://marketplace.visualstudio.com/items?itemName=AidanCole.oaicr) | O; important upstream of several task families. | [source][oaicr] |
| [AISRE.pr-review](https://marketplace.visualstudio.com/items?itemName=AISRE.pr-review) | Pipeline; learned rules, approval/provenance/audits; encrypted extension storage, not an ADO secret resource. | [docs/proprietary license](https://github.com/aisre-labs/pr-review), not reusable source. |
| [AkritiTripathi.CTSGPTPullRequestReviewaktripat](https://marketplace.visualstudio.com/items?itemName=AkritiTripathi.CTSGPTPullRequestReviewaktripat) | G; CTS variant, no separately substantiated differentiator. | [GPT upstream][gpt] |
| [altien.altien-aicr-develop](https://marketplace.visualstudio.com/items?itemName=altien.altien-aicr-develop) | O; development-branded identity. | [OpenAI upstream][oaicr] |
| [AniketTiwari.ai-pr-reviewer-at](https://marketplace.visualstudio.com/items?itemName=AniketTiwari.ai-pr-reviewer-at) | Service hook -> Azure Functions -> Azure OpenAI; manually deploy backend/hooks, depth/focus/draft settings. | Clone URL is a placeholder; own source not found. |
| [Antonioumak.guided-pr-review](https://marketplace.visualstudio.com/items?itemName=Antonioumak.guided-pr-review) | Pipeline + native Guide PR tab, chapters/diagrams, moved code, read tracking, attention policy. | [Credited inspiration](https://github.com/chasemc67/guided-pr-review) is **not** this implementation. |
| [ArclightVn.arclight-claude-pr-review](https://marketplace.visualstudio.com/items?itemName=ArclightVn.arclight-claude-pr-review) | Claude Code CLI; repository tools, deep review, budgets, work items, inline lifecycle; pipeline. | [source](https://github.com/viettdann/arclight-ado-claude-pr-review), GPL. |
| [arieslai.GPTPRReviewer](https://marketplace.visualstudio.com/items?itemName=arieslai.GPTPRReviewer) | G; Azure OpenAI review/comments. | [linked source](https://github.com/arieslai/azure-pipeline-ai-pr-review) |
| [AssetByMPD.NextGenAISmartMerge](https://marketplace.visualstudio.com/items?itemName=AssetByMPD.NextGenAISmartMerge) | G; adds detailed Azure OpenAI ARM/pipeline deployment examples, not proven autonomous merging. | Own source not found. |
| [azent-tech.azent-devops-extension](https://marketplace.visualstudio.com/items?itemName=azent-tech.azent-devops-extension) | Manual PR review/fix actions, inline+summary, Runs PR tab; also work-item coding. | Own source not found. |
| [AzureDevopsPullRequestReviewsAzureOpenAi.AzureDevopsPullRequestReviewsAzureOpenAi](https://marketplace.visualstudio.com/items?itemName=AzureDevopsPullRequestReviewsAzureOpenAi.AzureDevopsPullRequestReviewsAzureOpenAi) | G; Azure OpenAI variant. | [linked fork](https://github.com/jpitapeva/azure-pipeline-gpt-pr-review) |
| [AzureGPT-PRReviewer.AzureGPT-PRReviewer](https://marketplace.visualstudio.com/items?itemName=AzureGPT-PRReviewer.AzureGPT-PRReviewer) | G; GPT PR review task. | [linked source](https://github.com/shailesh/AzureGPT-PRReviewer) |
| [AzureOpenAIPRReviewer.AzureOpenAIPRReviewer](https://marketplace.visualstudio.com/items?itemName=AzureOpenAIPRReviewer.AzureOpenAIPRReviewer) | G; Azure OpenAI pipeline reviews. | [GPT upstream][gpt] |
| [AzureOpenAIPullRequestReviewBrazil.AzureOpenAIPullRequestReviewBrazil](https://marketplace.visualstudio.com/items?itemName=AzureOpenAIPullRequestReviewBrazil.AzureOpenAIPullRequestReviewBrazil) | G; Brazil/Azure variant. | [linked fork](https://github.com/jpitapeva/azure-pipeline-gpt-pr-review) |
| [baoduy2412.GPTPullRequestReviewDrunk](https://marketplace.visualstudio.com/items?itemName=baoduy2412.GPTPullRequestReviewDrunk) | G; separate fork, changes not audited. | [linked source](https://github.com/baoduy/azure-pipeline-gpt-pr-review) |
| [Biswajit.copilot-pr-review-v2](https://marketplace.visualstudio.com/items?itemName=Biswajit.copilot-pr-review-v2) | C; V2 advertises inline comments and resolving fixed findings; full PR diff and custom prompt. | V2 [linked repo](https://github.com/biswajitsamal59/copilot-pr-review) returned 404; older repo is not verified V2 source. |
| [blogic.AIPRR](https://marketplace.visualstudio.com/items?itemName=blogic.AIPRR) | G; Blogic reviewer. | [linked fork](https://github.com/gabriel-ecegi/azure-pipeline-gpt-pr-review) |
| [BMPullRequestReview.BMPullRequestReview](https://marketplace.visualstudio.com/items?itemName=BMPullRequestReview.BMPullRequestReview) | G; BuildingMinds variant. | [GPT upstream][gpt] |
| [ByteInsights.DevOps-AI-PR-Extension](https://marketplace.visualstudio.com/items?itemName=ByteInsights.DevOps-AI-PR-Extension) | Multi-provider whole-PR review, inline JSON, verification, batching, dedup and stale-thread closure; pipeline. | [source](https://github.com/JackInSightsV2/AzDevOps-PR-AI-Comments), MIT. |
| [CasablancaHotelsoftwareGmbH.casaAiPrReview](https://marketplace.visualstudio.com/items?itemName=CasablancaHotelsoftwareGmbH.casaAiPrReview) | G; OpenAI pipeline task. | [AI task upstream][ai] |
| [ciandt-global.flow-code-reviewer](https://marketplace.visualstudio.com/items?itemName=ciandt-global.flow-code-reviewer) | Flow-backed pipeline PR review; commercial service dependencies separate from installation. | Own source not found. |
| [codeantai.codeant-azure-devops-extension](https://marketplace.visualstudio.com/items?itemName=codeantai.codeant-azure-devops-extension) | Project service hooks plus optional gate/scan/coverage tasks; AI + SAST/IaC/secrets. | [Linked extension integration](https://github.com/shankarcdant/codeant-azure-devops-extensions); review engine openness not established. |
| [codylabs.cody-pro-review](https://marketplace.visualstudio.com/items?itemName=codylabs.cody-pro-review) | Pipeline BYOK Claude/OpenAI, summary/review thread; paid license. | [GitHub Action/support](https://github.com/codylabs/cody-code-reviewer), not verified open-source ADO Pro package. |
| [DanPost411.CTSGPTPullRequestReviewDan](https://marketplace.visualstudio.com/items?itemName=DanPost411.CTSGPTPullRequestReviewDan) | G; CTS variant. | [GPT upstream][gpt] |
| [DevOps-PR-Review.azdo-pr-agent](https://marketplace.visualstudio.com/items?itemName=DevOps-PR-Review.azdo-pr-agent) | Azure OpenAI pipeline; review/describe/improve/tests/security/compliance/ask/approval analysis. | [source](https://github.com/Mohammad-AlRousan/Azure-DevOps-PR-Agent), MIT; not community PR-Agent. |
| [DevOpsAssist.devops-assist-ai](https://marketplace.visualstudio.com/items?itemName=DevOpsAssist.devops-assist-ai) | Broader SDLC suite includes changed-file PR feedback for quality/security; Services/Server claimed. | Own source not found; hooks/providers/secret model not established. |
| [DiegoMancassola.d365fo-copilot-code-review](https://marketplace.visualstudio.com/items?itemName=DiegoMancassola.d365fo-copilot-code-review) | C; Dynamics 365-oriented Copilot pipeline review. | [linked source](https://github.com/diegomancassola23/d365fo.copilot.code-review) |
| [EC-Alex.ec-cody](https://marketplace.visualstudio.com/items?itemName=EC-Alex.ec-cody) | I; EC Cody-branded PRIA description. | [PRIA upstream][pria] |
| [epsilonnet.epsilon-ai-assistant](https://marketplace.visualstudio.com/items?itemName=epsilonnet.epsilon-ai-assistant) | Pipeline + PR action; Claude/Foundry service connection, Serena/C# full-repo exploration, separate model/publisher containers. | Own source not found. |
| [EricWellnitz.pria](https://marketplace.visualstudio.com/items?itemName=EricWellnitz.pria) | I; OpenAI/Azure with proper branch-policy instructions. | [source][pria] |
| [FairmasGmbH.AIPullRequestReview](https://marketplace.visualstudio.com/items?itemName=FairmasGmbH.AIPullRequestReview) | L; reviews with Ollama-hosted models. | Links [AI][ai]/[GPT][gpt] upstreams, not verified exact Fairmas source. |
| [Fastronome.fastronome-ai-code-review](https://marketplace.visualstudio.com/items?itemName=Fastronome.fastronome-ai-code-review) | API-based configurable review task; OpenAI task lineage. | [linked fork](https://github.com/fastronome/azure-devops-ai-code-review) |
| [Fastronome.fastronome-copilot-code-review](https://marketplace.visualstudio.com/items?itemName=Fastronome.fastronome-copilot-code-review) | C; separate CLI-based pipeline review product. | [linked source](https://github.com/fastronome/azure-devops-copilot-code-review) |
| [fdsilva.GPTPullRequestReviewBySGA](https://marketplace.visualstudio.com/items?itemName=fdsilva.GPTPullRequestReviewBySGA) | G; SGA variant. | [GPT upstream][gpt] |
| [FloExtensions.FloExtensions](https://marketplace.visualstudio.com/items?itemName=FloExtensions.FloExtensions) | G; OpenAI PR review. | [linked fork](https://github.com/FLORENCE/azure-pipeline-gpt-pr-review) |
| [gacprojects.oaicr](https://marketplace.visualstudio.com/items?itemName=gacprojects.oaicr) | O; republished OpenAI task. | [OpenAI upstream][oaicr] |
| [Garansys.garansys-copilot-code-review](https://marketplace.visualstudio.com/items?itemName=Garansys.garansys-copilot-code-review) | C; Copilot CLI task. | [Little Fort upstream][littlefort]; own fork not established. |
| [GiorgosPanagiotopoulos.epsilonnet-ai-pr-review](https://marketplace.visualstudio.com/items?itemName=GiorgosPanagiotopoulos.epsilonnet-ai-pr-review) | Pipeline Azure OpenAI; grep-selected neighbor files, rules, SHA dedup, inline findings, critical PR status. | Own source not found. |
| [gn-group.open-ai-code-review](https://marketplace.visualstudio.com/items?itemName=gn-group.open-ai-code-review) | Pipeline Azure OpenAI; severity caps, retries, existing comments, before/after fixes, templates. | Own source not found. |
| [GreatWolfLodge.GWLGPTPullRequestReview](https://marketplace.visualstudio.com/items?itemName=GreatWolfLodge.GWLGPTPullRequestReview) | G; branded variant. | [GPT upstream][gpt] |
| [HAITIntegrations.InternalGPTPullRequestReview](https://marketplace.visualstudio.com/items?itemName=HAITIntegrations.InternalGPTPullRequestReview) | G; despite Internal title, public description; no special private-hosting guarantee. | [GPT upstream][gpt] |
| [hbsmith.pria](https://marketplace.visualstudio.com/items?itemName=hbsmith.pria) | I; separate fork. | [linked source](https://github.com/hbsmith/pr-inspection-assistant) |
| [hotai-bt020.GenAIAdvancedPRReviewer](https://marketplace.visualstudio.com/items?itemName=hotai-bt020.GenAIAdvancedPRReviewer) | A; branded variant. | [GenAI upstream][genai] |

### I-Z

| Extension | Features / qualification | Public repository reference |
| --- | --- | --- |
| [IcatuSeguros.codereview-azureopenai](https://marketplace.visualstudio.com/items?itemName=IcatuSeguros.codereview-azureopenai) | G-like Azure OpenAI pipeline review, Portuguese setup. | Own source not found. |
| [InnovaApps.azure-repos-pr-reviewer](https://marketplace.visualstudio.com/items?itemName=InnovaApps.azure-repos-pr-reviewer) | Manual AI Review PR tab, indexed/agent context, BYOK or included Claude, draft publishing/costs. | Closed implementation; external secret vault and embedding/index storage. |
| [InnovaAppsGH.azure-repos-pr-reviewer](https://marketplace.visualstudio.com/items?itemName=InnovaAppsGH.azure-repos-pr-reviewer) | Separate Copilot PR tab/draft-approval commercial preview. | Own source not found. |
| [inskyid.AIPrReviewer](https://marketplace.visualstudio.com/items?itemName=inskyid.AIPrReviewer) | G-like pipeline reviewer adds Azure AI Foundry model configuration. | [linked source](https://github.com/yopichy/azure-pipeline-ai-pr-reviewer) |
| [JaeILYu.OAICodeReview](https://marketplace.visualstudio.com/items?itemName=JaeILYu.OAICodeReview) | G; GPT review variant. | [linked fork](https://github.com/dbwodlf3/azure-pipeline-gpt-pr-review) |
| [JamesBurns.AOIPullRequestReview](https://marketplace.visualstudio.com/items?itemName=JamesBurns.AOIPullRequestReview) | G; Azure OpenAI deployment task. | [linked source](https://github.com/j-bur/azure-pipeline-gpt-pr-review) |
| [JohnSeong.claude-code-review](https://marketplace.visualstudio.com/items?itemName=JohnSeong.claude-code-review) | Anthropic pipeline, confidence threshold/model/max files, summary. | [User-corrected reference returned 404](https://github.com/sandole/claude-code-review-ado); user had already replaced a differing repository reference in the supplied list. See landscape for provenance. |
| [JulioOSilva.JulioSilva](https://marketplace.visualstudio.com/items?itemName=JulioOSilva.JulioSilva) | O; CEPEDI variant. | [linked fork](https://github.com/juosilvaIos/CEP-OpenAI-Code-Review) |
| [JumpInnovations.JumpCodeWhisper](https://marketplace.visualstudio.com/items?itemName=JumpInnovations.JumpCodeWhisper) | Pipeline OpenAI/Anthropic, custom instruction prompt and review comments. | [linked source](https://github.com/michel-jump/azure-pipeline-ai-pr-review) |
| [junior151280.bfe3cd1b-dfb4-4c72-8f50-d0caea4f3db8](https://marketplace.visualstudio.com/items?itemName=junior151280.bfe3cd1b-dfb4-4c72-8f50-d0caea4f3db8) | IAPullRequestReview; Azure OpenAI pipeline review. | [linked source](https://github.com/jpitapeva/extensao-devops-pull-request) |
| [junior151280.cd11d9f3-81f4-4580-b689-066a2a51bad8](https://marketplace.visualstudio.com/items?itemName=junior151280.cd11d9f3-81f4-4580-b689-066a2a51bad8) | ADOPRCodeReviewAI; Azure OpenAI task, detailed token/permission setup. | [linked source](https://github.com/junior151280/azure-pipeline-code-review-ai) |
| [kocsistem-ronesans.KocSistemPR-Reviewer](https://marketplace.visualstudio.com/items?itemName=kocsistem-ronesans.KocSistemPR-Reviewer) | G; KocSistem variant. | Own source not found. |
| [kohta-jrits.gpt-pr-review-jp](https://marketplace.visualstudio.com/items?itemName=kohta-jrits.gpt-pr-review-jp) | G; Japanese feedback, OpenAI/Azure. | [source](https://github.com/kohta-jrits/azure-pipeline-gpt-pr-review-jp), MIT. |
| [kselva92.AIPullRequestReviewPrompt](https://marketplace.visualstudio.com/items?itemName=kselva92.AIPullRequestReviewPrompt) | G; prompt-focused variant. | [linked fork](https://github.com/kselva92/azure-pipeline-gpt-pr-review) |
| [LawrenceShen.ai-pr-autoreview](https://marketplace.visualstudio.com/items?itemName=LawrenceShen.ai-pr-autoreview) | Multiple native/compatible providers, Copilot, prompt modes, inline JSON, incremental/full-file choices. | [source](https://github.com/lawrence8358/AI-PR-AutoReview), MIT. |
| [lcsrodriguesc.GPTPullRequestReviewBR](https://marketplace.visualstudio.com/items?itemName=lcsrodriguesc.GPTPullRequestReviewBR) | G-like Azure OpenAI task; Portuguese/Brazil output. | [GPT upstream][gpt] |
| [LenaSoftware.LenaCodeReviewAssistant](https://marketplace.visualstudio.com/items?itemName=LenaSoftware.LenaCodeReviewAssistant) | OpenAI pipeline, model/files/custom prompt, no-comment suppression. | Own source not found. |
| [LittleFortSoftware.ado-copilot-code-review](https://marketplace.visualstudio.com/items?itemName=LittleFortSoftware.ado-copilot-code-review) | C plus Claude Code and custom BYOK; repo exploration, inline lifecycle, Boards/Jira, budgets. | [source][littlefort], GPL. |
| [MaciejTubek.ai-code-review-claude](https://marketplace.visualstudio.com/items?itemName=MaciejTubek.ai-code-review-claude) | Anthropic task, whole diff, focus/file/prompt controls, configurable cost reporting. | [source](https://github.com/mtubek/azure-devops-ai-code-review-claude), MIT. |
| [martin-trojan.OpenCodeAgent](https://marketplace.visualstudio.com/items?itemName=martin-trojan.OpenCodeAgent) | OpenCode workspace review/command pipeline task, custom agents/providers; V2 migration unverified. | [source](https://github.com/trojanmartin/opencode-azdo-extension), MIT. |
| [mcdonnell-john.OpenAIPRReviewer](https://marketplace.visualstudio.com/items?itemName=mcdonnell-john.OpenAIPRReviewer) | G; OpenAI review task. | [linked source](https://github.com/mcdonnell-john/azure-pipeline-gpt-pr-review) |
| [mlk5436.AzureOpenAIPRReview](https://marketplace.visualstudio.com/items?itemName=mlk5436.AzureOpenAIPRReview) | Azure pipeline task; changed-file/binary filters, PR comments, old generated-comment cleanup. | Own source not found; cleanup scope needs inspection. |
| [MohamedBelkamel.GPTPullRequestReviewLangchain](https://marketplace.visualstudio.com/items?itemName=MohamedBelkamel.GPTPullRequestReviewLangchain) | G; LangChain-based model execution advertised. | [linked source](https://github.com/darklight147/azure-pipeline-gpt-pr-review) |
| [NCHCorporation.NCHPullRequestReview](https://marketplace.visualstudio.com/items?itemName=NCHCorporation.NCHPullRequestReview) | G; branded task. | [GPT upstream][gpt] |
| [Newmark.pria](https://marketplace.visualstudio.com/items?itemName=Newmark.pria) | I; fork. | [linked source](https://github.com/brianbegy/pr-inspection-assistant) |
| [Newmark.prian](https://marketplace.visualstudio.com/items?itemName=Newmark.prian) | I; separate identity of same linked fork. | [linked source](https://github.com/brianbegy/pr-inspection-assistant) |
| [NikitaShinde.GPTPullRequestReview](https://marketplace.visualstudio.com/items?itemName=NikitaShinde.GPTPullRequestReview) | G; no independently substantiated advanced feature despite different version numbering. | Own source not found. |
| [nitta-a.llm-pr-reviewer](https://marketplace.visualstudio.com/items?itemName=nitta-a.llm-pr-reviewer) | Pipeline diff review; Azure/OpenAI/Anthropic/Bedrock advertised. | [linked source](https://github.com/nitta-a/az-pipeline-AI-review) |
| [NORRIQeBusiness.NorriqAIPullRequestReview](https://marketplace.visualstudio.com/items?itemName=NORRIQeBusiness.NorriqAIPullRequestReview) | Azure OpenAI pipeline, editable prompt and endpoint settings. | Own source not found. |
| [NortalDE.GPTPullRequestReviewNortal](https://marketplace.visualstudio.com/items?itemName=NortalDE.GPTPullRequestReviewNortal) | G; customizable prompts highlighted. | [linked fork](https://github.com/JanEisen/azure-pipeline-gpt-pr-review) |
| [nztgdev.pria](https://marketplace.visualstudio.com/items?itemName=nztgdev.pria) | I; republished PRIA. | [PRIA upstream][pria] |
| [OneForge.CodeReviewAgent](https://marketplace.visualstudio.com/items?itemName=OneForge.CodeReviewAgent) | OpenCode pipeline variant with internal enterprise provider; custom agents/review prompt. | Own source not found; do not expose private endpoint assumptions in our design. |
| [OneFrame.OneFrame-Pull-Request-Reviewer](https://marketplace.visualstudio.com/items?itemName=OneFrame.OneFrame-Pull-Request-Reviewer) | G; GPT-based task. | Own source not found. |
| [OngWaiKiat.ai-code-review-unified](https://marketplace.visualstudio.com/items?itemName=OngWaiKiat.ai-code-review-unified) | Git PR + TFVC shelveset review; Gemini/Ollama, multi-key/model retry. | Own source not found. |
| [OruchReis.priaAzure](https://marketplace.visualstudio.com/items?itemName=OruchReis.priaAzure) | I; Azure OpenAI fork. | [linked source](https://github.com/oruchreis/pr-inspection-assistant) |
| [pablomgg.2ece7e88-1566-4e4b-ba5d-ed15f9b23d97](https://marketplace.visualstudio.com/items?itemName=pablomgg.2ece7e88-1566-4e4b-ba5d-ed15f9b23d97) | G; AI PR Review task. | [linked source](https://github.com/pablomgg/azure-pipeline-ai-pr-review) |
| [pantodev.panto-code-review](https://marketplace.visualstudio.com/items?itemName=pantodev.panto-code-review) | ADO AI review integration; sparse description, detailed trigger/provider support unknown. | Own source not found. |
| [PawelS.GPTREVIEWMEDIUS](https://marketplace.visualstudio.com/items?itemName=PawelS.GPTREVIEWMEDIUS) | G; Medius variant. | [linked fork](https://github.com/PawelPS/pipeline-gpt) |
| [Paybyrd.ai-code-review](https://marketplace.visualstudio.com/items?itemName=Paybyrd.ai-code-review) | O variant with OpenAI and Anthropic choice. | [linked fork](https://github.com/luizfdias/OpenAI-Code-Review) |
| [piotrgredowski.gpt-pr-preview](https://marketplace.visualstudio.com/items?itemName=piotrgredowski.gpt-pr-preview) | G; explicitly forked task. | [linked source](https://github.com/piotrgredowski/azure-pipeline-gpt-pr-review) |
| [plain.AzureOpenAiCopilot](https://marketplace.visualstudio.com/items?itemName=plain.AzureOpenAiCopilot) | Azure task; API key, managed identity or service connection, custom model/language/instructions. | [linked source](https://github.com/plain-insure/azure-pipeline-gpt-pr-review) |
| [pretius.pretius-openai-reviewer2](https://marketplace.visualstudio.com/items?itemName=pretius.pretius-openai-reviewer2) | Title Test; description contains Pretius OpenAI pipeline reviewer setup and secret variable group. | Own source not found; test identity, not recommended baseline. |
| [PretiusSoftware.pretius-openai-reviewer](https://marketplace.visualstudio.com/items?itemName=PretiusSoftware.pretius-openai-reviewer) | OpenAI pipeline reviewer, newer model/rate-limit and seed/reproducibility controls. | Own source not found. |
| [RachitSinghal.code-review-bot](https://marketplace.visualstudio.com/items?itemName=RachitSinghal.code-review-bot) | OpenAI task, language/framework skills, summary + limited critical/high inline findings. | [source](https://github.com/rs-001-ai/ai-code-review-extension), MIT, master branch. |
| [RachitSinghal.copilot-code-review-bot](https://marketplace.visualstudio.com/items?itemName=RachitSinghal.copilot-code-review-bot) | C; extension-based language skills/framework heuristics, fallback, central cross-repo validation. | [linked source](https://github.com/rs-001-ai/ai-code-review-extension-copilot) |
| [RapozoAntonio.azure-pr-bot](https://marketplace.visualstudio.com/items?itemName=RapozoAntonio.azure-pr-bot) | Pipeline OpenAI/Azure, PR summary, glob exclusions, custom review instructions. | [linked source](https://github.com/rapozoantonio/azure-pr-bot) |
| [Ruben-Nintex.aoai-code-reviewer](https://marketplace.visualstudio.com/items?itemName=Ruben-Nintex.aoai-code-reviewer) | OpenAI/Azure pipeline; incremental file tracking, outdated-comment cleanup, custom prompts. | [linked source](https://github.com/Ruben-Nintex/aoai-review) |
| [SatrackSAS.pull-request-reviewer](https://marketplace.visualstudio.com/items?itemName=SatrackSAS.pull-request-reviewer) | Azure OpenAI task, Spanish setup and branch-policy instructions. | [linked source](https://github.com/SatrackDevops01/extension-devops-pull-request) |
| [scrutin.scrutin-code-review](https://marketplace.visualstudio.com/items?itemName=scrutin.scrutin-code-review) | Auto service hooks, actual PR tab/hub, AI+static checks, secret/IaC scanning, comment cap/fixes. | Own implementation source not found; MIT claim alone insufficient. |
| [SergioCabrera.PullRequestReviewIA](https://marketplace.visualstudio.com/items?itemName=SergioCabrera.PullRequestReviewIA) | G; IA v2 variant. | [GPT upstream][gpt] |
| [shazil.gpt-pr-review](https://marketplace.visualstudio.com/items?itemName=shazil.gpt-pr-review) | GPT PR Reviewer title/metadata; retrieved description insufficient for detailed features. | Own source not found. |
| [SimoneBittiDev.GenAIAdvancedPRReviewerAlpha](https://marketplace.visualstudio.com/items?itemName=SimoneBittiDev.GenAIAdvancedPRReviewerAlpha) | A; alpha fork, separately versioned. | [GenAI upstream][genai] |
| [SimoneBittiDev.skillflow-pr](https://marketplace.visualstudio.com/items?itemName=SimoneBittiDev.skillflow-pr) | Markdown skills, multi-provider LangGraph agent, read/comment/commit/new-PR tools, optional tracing. | [public source](https://github.com/simonebittidev/azure-devops-skillflow), license not detected. |
| [SRAI-Infra.SRAIPullRequestReviewPrompt](https://marketplace.visualstudio.com/items?itemName=SRAI-Infra.SRAIPullRequestReviewPrompt) | G; prompt-focused Symphony variant. | [linked fork](https://github.com/symphonyretailai/azure-pipeline-gpt-pr-review) |
| [subzone.ad-ai-pr-reviewer](https://marketplace.visualstudio.com/items?itemName=subzone.ad-ai-pr-reviewer) | Pipeline reviews **GitHub/GitLab/Bitbucket** PRs; not established to review Azure Repos PRs. | [linked source](https://github.com/subzone/ad-ai-pr-reviewer) |
| [T-IDSolutions.T-IDGPTCodeReview](https://marketplace.visualstudio.com/items?itemName=T-IDSolutions.T-IDGPTCodeReview) | G; T-ID variant. | Publisher profile link, not a verified implementation repo. |
| [teriansilva.olcr](https://marketplace.visualstudio.com/items?itemName=teriansilva.olcr) | L; on-prem Ollama code review, prompts/files/focus controls. | [public source](https://github.com/teriansilva/azure-devops-ollama-code-reviewer); license unresolved. |
| [TionitGPTPullRequestReview.TionitGPTPullRequestReview](https://marketplace.visualstudio.com/items?itemName=TionitGPTPullRequestReview.TionitGPTPullRequestReview) | GPT task metadata; sparse retrieved description, detailed behavior unknown. | [GPT upstream][gpt] |
| [TommiLaukkanen.ai-code-review](https://marketplace.visualstudio.com/items?itemName=TommiLaukkanen.ai-code-review) | Azure OpenAI task, summaries, focus/file/prompt and cost controls; ancestor of Claude variant. | [source](https://github.com/tlaukkanen/azure-devops-ai-code-review), MIT. |
| [Totvs-EngenhariaSaaS.azdevops-extension-ai-pr-comments](https://marketplace.visualstudio.com/items?itemName=Totvs-EngenhariaSaaS.azdevops-extension-ai-pr-comments) | Multi-provider comments, coding standards, full-file/diff choices, inline feedback, update controls. | Own source not found; resembles older Byte Insights description, not proof of equivalent v2 engine. |
| [TsezariMshvenieradzeTfsAIReviewTask.ai-pr-code-review](https://marketplace.visualstudio.com/items?itemName=TsezariMshvenieradzeTfsAIReviewTask.ai-pr-code-review) | Anthropic service connection/secret alternative, inline+summary, dedup, globs/full-file context, fail-on-critical. | [linked source](https://github.com/tsmshvenieradze/ClaudeCodeReview) |
| [tw-developer.GPTPRReviewer](https://marketplace.visualstudio.com/items?itemName=tw-developer.GPTPRReviewer) | Pipeline; OpenAI/Azure/Claude/Gemini/**DeepSeek**, system prompt, 22 response languages. | [GPT upstream][gpt], not verified exact modern fork source. |
| [ubiquityai.ubiquity-ai-pr-review](https://marketplace.visualstudio.com/items?itemName=ubiquityai.ubiquity-ai-pr-review) | L; diff+file+rules to Ollama/compatible endpoint, PR threads. | Credits Ollama upstream; no own repo located, upstream license unresolved. |
| [ukaszGawin.GingerReviewerGPT](https://marketplace.visualstudio.com/items?itemName=ukaszGawin.GingerReviewerGPT) | G; Ginger variant. | [GPT upstream][gpt] |
| [Useall.GPTPullRequestReviewPTBR](https://marketplace.visualstudio.com/items?itemName=Useall.GPTPullRequestReviewPTBR) | GPT pipeline task with PT-BR output. | [linked localization fork](https://github.com/passarela/azure-pipeline-gpt-pr-review-pt-br) |
| [vkristiapti.vkristiapti](https://marketplace.visualstudio.com/items?itemName=vkristiapti.vkristiapti) | G; branded task. | [GPT upstream][gpt] |
| [YuriNabaia.DTA-CODE-REVIEW-BOT](https://marketplace.visualstudio.com/items?itemName=YuriNabaia.DTA-CODE-REVIEW-BOT) | DTA review pipeline bot; configurable task and repository permission setup, Portuguese docs. | [linked source](https://github.com/yuriduartetotvs/DTA-VISION-CODE-REVIEW-BOT) |

### Additional discovery

| Extension | Features / qualification | Source |
| --- | --- | --- |
| [tamedeveloper.diffsift](https://marketplace.visualstudio.com/items?itemName=tamedeveloper.diffsift) | Windows desktop app, optional PR polling, local/compatible models, evidence-backed Markdown review packs; never posts/approves/merges. Commercial despite free listing label. | [Product docs](https://diffsift.dev/docs); own implementation source not found. |

## 2. Unpublished identities (U)

Not available for a normal new Marketplace installation based on the observed
flag. A public source repository may still be useful. Baseline profiles have the
same limited meaning as above; individual versions/forks were not audited.

| Item ID | Features/profile and distinct note | Source reference |
| --- | --- | --- |
| `AbsoluteAzure.GPTPullRequestReview` | G | [upstream][gpt] |
| `acsbarchilon.BetaAquarelaPRReview` | G; Aquarela beta | [linked fork][aquarela] |
| `acsvalidation.GPTPullRequestReview` | G | [upstream][gpt] |
| `AgmoStudio.AgmoStudio` | G | [upstream][gpt] |
| `AgmoStudio.AgmoStudioPRReviewStaging` | G; staging | [upstream][gpt] |
| `AhsanKhanDGE.universal-ai-pr-reviewer` | Multi-provider incl. DeepSeek/Foundry/vLLM/custom REST; confidence JSON, dashboard, summaries/file threads | Own source not found. |
| `AI-Reviewer.PH-AI-Reviewer` | AutoReview-derived, pipeline multi-provider review | [linked upstream][autoreview] |
| `AIPullRequestReview.d6db4b30-9b88-4a81-96bb-84201582f3fc` | G | [linked fork][pablomgg] |
| `AnDang.pria` | I | [upstream][pria] |
| `AohKNguyen.AIPullRequestReview` | G | [linked fork](https://github.com/nkhoaa96/azure-pipeline-ai-pr-review) |
| `aquarelacs.bedrock-pr-reviewer` | Pipeline **Amazon Bedrock** review, custom instructions/PR feedback advertised | Repository link is a placeholder. |
| `arth-devops.ai-pr-review-extension` | Azure OpenAI pipeline, structured summary, Python/YAML/Terraform support claimed | Own source not found. |
| `Asprova.GenAIAdvancedPRReviewerAs` | A | [upstream][genai] |
| `AssetByMPD.GPTPullRequestReview` | G | Own source not found. |
| `AssetByMPD.GPTPullRequestReviewByMPD` | G | [upstream][gpt] |
| `ATTG.ATTGGPTPullRequestReview` | G | [upstream][gpt] |
| `Awarious.GPTPullRequestReview` | G | [linked fork](https://github.com/kanvishok/azure-pipeline-gpt-pr-review) |
| `AzCloudExperts.aoaicr` | O; Azure OpenAI variant | [upstream][oaicr] |
| `AzureOpenAIPullRequestReviewJPComp.AzureOpenAIPullRequestReviewJPComp` | G; Azure/PT-BR | [linked fork][jpitapeva] |
| `Biswajit.copilot-pr-review` | C; accessible older README says general comments, not V2 inline implementation | [older source](https://github.com/biswajitsamal59/ado-copilot-code-review), GPL. |
| `Bridgenext.067763d8-5d00-4308-b234-6c0fdd472e06` | O; Azure OpenAI with integrated identity advertised | [linked fork](https://github.com/bridgenext/OpenAI-Code-Review) |
| `BrukerChemspeed.brch-copilot-code-review` | C; Copilot/Claude Code family | [linked source](https://github.com/little-fort/brch-copilot-code-review) |
| `CEPEDI.azure` | O-like OpenAI review task | [upstream][oaicr] |
| `cepoaicr.cepoaicr` | O | [linked fork][cep] |
| `cw-group.CW-GPTPullRequestReview` | G | [linked fork](https://github.com/BrendonLiu/azure-pipeline-gpt-pr-review) |
| `d2o.AIPullRequestReview` | G | [upstream][ai] |
| `d2o.GPTPullRequestReview` | G | [upstream][gpt] |
| `DekiruSolutionsAB.AIPullRequestReview` | Bounded TS agent, read/search/history tools, coverage tracker, PR/file/line comments/statuses; OpenAI/Azure/Ollama/custom | [public source](https://github.com/dekirusolutions/azure-pipeline-pr-review), MIT. |
| `DharmarajBalasoUpase.GPTPullRequestReview1` | G | [upstream][gpt] |
| `Disprz.DisprzAIPRCodeReview` | G | [upstream][ai] |
| `Disprz.DisprzAIPRReview` | G | [upstream][ai] |
| `DmitryRozenraukh.devops-ai-pr-review` | Native AI Review PR hub, self-hosted Docker backend, local/Azure OpenAI flows | [linked source](https://github.com/rosenbom/DevOpsAIPRReview) |
| `eaxess.pria-eaxess` | I | [upstream][pria] |
| `emrebgdd.DemoGPTPullRequestReview` | G; demo | [upstream][gpt] |
| `emrebgdd.GPTPullRequestReview` | G | [upstream][gpt] |
| `emrebgdd.GPTPullRequestReview-TR` | G; Turkish output | [linked fork][turkish] |
| `emrebgdd.GPTPullRequestReviewPTBR` | G-like PT-BR output | [linked fork][ptbr] |
| `emrebgdd.GPTPullRequestReviewTR` | G; separate Turkish identity | [linked fork][turkish] |
| `emrebgdd.NephosGPTPullRequestReview` | G; Nephos variant | [upstream][gpt] |
| `EricWellnitz.aicr` | O-like predecessor of PRIA | [linked source](https://github.com/ewellnitz/ai-code-review) |
| `euforic.AIPRReview` | G; OpenAI task | [linked source](https://github.com/euforic/azure-pipeline-gpt-pr-review) |
| `FairmasGmbH.AiPoweredPullRequestCodeReview` | G; Azure-hosted/OpenAI LLMs | [upstream][gpt] |
| `FarReach.FRGPTPullRequestReview` | G | [upstream][gpt] |
| `fdelivamsft.GPTPullRequestReviewSelf` | G; **proxy** support highlighted | [linked fork][proxy] |
| `fdsilva.GPTPullRequestReview` | G | [upstream][gpt] |
| `fdsilva.GPTPullRequestReviewSGA` | G; SGA identity | [upstream][gpt] |
| `FEFI.FEFIGPTPullRequestReview` | G | [upstream][gpt] |
| `FilipeDuarte.GPTPullRequestReview` | G; SGA variant | [upstream][gpt] |
| `FilipePereira.f3m-open-ai-code-review` | Azure OpenAI code review task | [upstream][gpt]; locked flag also observed. |
| `GPTAICodeReviewPrompt.GPTAICodeReviewPrompt` | G; Blogic older identity | [linked fork](https://github.com/gabriel-ecegi/azure-pipeline-gpt-pr-review) |
| `investments-buildtasks.investments-pullrequestreview-ai` | G; Azure OpenAI security/performance/quality feedback advertised | [upstream][gpt] |
| `JaeILYu.GPTCodeReview` | G | [linked fork](https://github.com/dbwodlf3/azure-pipeline-gpt-pr-review) |
| `JaeILYu.GPTPullRequestReview` | G | [upstream][gpt] |
| `JamesBurns-dev.AOIPullRequestReview` | G; Azure development identity | [linked source](https://github.com/j-bur/azure-pipeline-gpt-pr-review) |
| `JithinJojiAnchanattu.ai-assisted-code-review` | O; configurable AI-assisted task | [linked source](https://github.com/jithinanchanattu/AI-Assisted-Code-Review) |
| `JulioOSilva.JulioOSilva` | O; CEPEDI identity | [linked fork][cep] |
| `leonardobarchilonacs.AquarelaPRReview` | G; Aquarela | [linked fork][aquarela] |
| `leonardobarchilonacs.GPTPRReviewB` | G; updated GPT variant | [linked fork][aquarela] |
| `micheleferracin.MFPullRequestCopilot-dev` | G; OpenAI PR Copilot **not GitHub Copilot CLI proven** | [linked source](https://github.com/phenixita/azure-pipeline-pr-copilot) |
| `mlk5436.AzureChatGPTPullRequestReviewer` | G; Azure variant | [upstream][gpt] |
| `mlk5436.CTSGPTPullRequestReview` | G | [upstream][gpt] |
| `mlk5436.GPTPullRequestReviewTest` | G; test identity | [upstream][gpt] |
| `mlk5436.GPTPullRequestReviewTest1` | G; test identity | [upstream][gpt] |
| `mlk5436.GPTPullRequestReviewTest2` | G; test identity | [upstream][gpt] |
| `mlk5436.GPTPullRequestReviewTest3` | G; test identity | [upstream][gpt] |
| `mlk5436.GPTPullRequestReviewTest4` | G; test identity | [upstream][gpt] |
| `mmr.GIAPullRequestReview` | G | [linked fork][marcel] |
| `mmr.SPS-AIPullRequestReview` | G | [linked fork][marcel] |
| `MPD.GPTPullRequestReview` | G | [upstream][gpt] |
| `MPDAsset.GPTPullRequestReview` | G | [upstream][gpt] |
| `MpgAIPR.MPGAIPullRequestReview` | I-like description | Own source not found. |
| `msd-quantum.Azure-OpenAI-PR-Reviewer` | G; Azure variant | [upstream][gpt] |
| `mustaphalarhrouch.GPTPullRequestReview` | G; original upstream listing | [public source][gpt], MIT; unpublished/locked. |
| `Nesto.nesto-pria` | I | [linked fork](https://github.com/eatingbug/pr-inspection-assistant) |
| `NexusGPTPullRequestReview.NexusGPTPullRequestReview` | G | Own source not found; locked flag. |
| `OneFrame.KocSistemPR-Reviewer-Dev` | G; development identity | Own source not found. |
| `OngWaiKiat.gemini-ai-code-review` | Gemini pipeline; Git PR + TFVC gated check-ins | Placeholder repository link, not source. |
| `OngWaiKiat.GeminiAIPRReview` | Gemini PR review task | Own source not found. |
| `OngWaiKiat.OpenAIPRReview` | G; OpenAI predecessor | Own source not found. |
| `OngWaiKiat.self-hosted-ai-code-review` | L; self-hosted Ollama task | [linked source](https://github.com/OngWaiKiat/self-hosted-ai-code-review) |
| `OngWaiKiat.self-hosted-ai-pr-review` | L; separate Ollama task identity | [linked source](https://github.com/OngWaiKiat/self-hosted-ai-pr-review) |
| `OpenAICodeReviewCEPEDI.cepoaicr` | O; CEPEDI | [linked fork][cep] |
| `pablomgtest-01.00b2f20c-fefa-4b91-b14f-043cef82047e` | G; test identity | [linked fork][pablomgg] |
| `Paybyrd.pbopenai2` | O; OpenAI-only predecessor | [upstream][oaicr] |
| `PhilipSchneider.tdm-ai-pr-reviewer` | G; Azure OpenAI | [upstream][gpt] |
| `PiotrDebicki.GPTPullRequestReviewWithBearerToken` | G; bearer-token variant advertised | [upstream][gpt]; specific fork not established. |
| `pretius.openai-reviewer` | Pretius OpenAI pipeline reviewer | Own source not found. |
| `pretius.pretius-openai-reviewer` | Pretius DEV identity | Own source not found. |
| `Ridvay.ridvay-security-guard` | Security-focused AI PR review metadata; description not retrieved | [linked integration](https://github.com/ridvay/ridvay-azuredevops-extension) |
| `Ruben-Nintex.pr-review-extension` | Azure OpenAI PR review predecessor | Own source not found; locked flag. |
| `schwarz-consult.GPTPullRequestReview` | G | [upstream][gpt] |
| `SDDepositoryLLC.oaicrsdb` | OpenAI/Azure code review metadata; description not retrieved | Own source not found. |
| `SimovaGmbH.codegate` | Codegate review metadata; description not retrieved | Own source not found. |
| `test-flow-reviewer.flow-review-pull-request-extension` | Flow Code Reviewer test publisher | Own source not found; locked flag. |
| `testlatest.GPTPullRequestReview` | G; test identity | [upstream][gpt] |
| `Tionit.TionitGPTPullRequestReview` | GPT review metadata, detailed behavior uncertain | [upstream][gpt] |
| `wkiat97.GPTPullRequestReview-wkiat` | G | [upstream][gpt] |
| `YuShengReviewCode.YuShengReviewCode` | O; AI-assisted review lineage | [linked upstream](https://github.com/jithinanchanattu/AI-Assisted-Code-Review) |

## 3. Description unavailable / uncertain identity (?)

All rows below have **Unknown** detailed features and installability in this
survey. The middle column records only the title/metadata lead, not verified
implementation behavior. Old IDs, missing assets and placeholder links are not
evidence of usable open-source products.

| Item ID | Metadata lead only | Repository reference from metadata, if any |
| --- | --- | --- |
| `abozar.AdvancedPRReviewer` | Advanced PR Reviewer alias | [GenAI][genai] |
| `acsbarchilon.AquarelaPRReview` | Aquarela beta alias | [Aquarela][aquarela] |
| `AeriesSoftware.ai-assisted-code-review` | AI-Assisted Code Review | [linked](https://github.com/jameslancaster/AI-Assisted-Code-Review) |
| `Aeroseal.GenAIAdvancedPRReviewer` | Advanced reviewer fork identity | [GenAI][genai] |
| `AIPullRequestReview.AIPullRequestReview` | AI PR Review alias | [linked][pablomgg] |
| `Asprova.GenAIAdvancedPRReviewer` | Advanced reviewer alias | [GenAI][genai] |
| `Awarious.AwariousGPTPullRequestReview` | GPT alias | [linked](https://github.com/kanvishok/azure-pipeline-gpt-pr-review) |
| `Azuredevopspullrequestreviewjpcomp.Azuredevopspullrequestreviewjpcomp` | JPComp alias | [linked][jpitapeva] |
| `AzureGPT-PRReviewer.GPTPullRequestReviewer` | GPT reviewer alias | [linked](https://github.com/shailesh/AzureGPT-PRReviewer) |
| `AzureOpenAI-PullRequestCodeReview.AzureOpenAI-PullRequestCodeReview` | Azure OpenAI alias | [linked](https://github.com/jpitapeva/extensao-devops-pull-request) |
| `BANCO-BDMG.CodeBDMGPR` | GPT review metadata | Not found. |
| `BeckmanCoulterChaska.bciaicr` | Azure AI review metadata | Not found. |
| `BlueLotus360.AzAIPullRequestReview` | Azure OpenAI alias | [linked](https://github.com/darklight147/azure-pipeline-gpt-pr-review) |
| `BMPullRequestReview.BMGPTPullRequestReview` | BuildingMinds alias | Not found. |
| `BMT.AIPullRequestReviewer` | AI reviewer metadata | Not found. |
| `bp-devops.AIAzureDevOpsPR` | AI Azure DevOps PR alias | [linked](https://github.com/pepelepew/AIAzureDevOpsPR) |
| `BrukerChemspeed.ado-copilot-code-review` | Copilot alias | [upstream][littlefort] |
| `BrukerChemspeed.bc-copilot-code-review` | Copilot alias | [linked](https://github.com/little-fort/bc-copilot-code-review) |
| `ByteInsights.AzDo-AI-PR-Extension` | PR Comment Task with AI alias | [linked](https://github.com/JackInSightsV2/Azure-DevOps-PR-AI-Code-Reviewer) |
| `ChatGPTFork.ChatGPT-PRreview-Fork` | GPT fork identity | [linked](https://github.com/dpbfh/azure-pipeline-gpt-pr-review) |
| `COEXYA-SWL.coexya-ado-copilot-code-review` | Copilot fork identity | Not found. |
| `DefendOps.DefendOps` | Compatible-API review metadata | [Dekiru source](https://github.com/dekirusolutions/azure-pipeline-pr-review), exact package not verified. |
| `DevOpsStudent.GPTPullRequestReviewTW` | GPT review alias | [upstream][gpt] |
| `epsilonnet.eps-ai-pr-review` | AI PR Review alias | Not found. |
| `epsilonnet.epsilonnet-ai-pr-review` | AI PR Review alias | Not found. |
| `fdelivamsft.GPTPullRequestReview` | GPT proxy lineage alias | [linked][proxy] |
| `fxstreet.GPTPullRequestReview` | FXS review alias | [upstream][gpt] |
| `gabrysuerz.oaicr` | OpenAI review alias | [upstream][oaicr] |
| `HAITIntegrations.InternalChatGPTPullRequestReview` | Internal GPT alias | Not found. |
| `hihigashdemo.aoia-pr-reviewer` | Azure OpenAI review metadata | Not found. |
| `HongyangDu.PullRequestCopilot` | Pull Request Copilot metadata | Not found. |
| `IndigoTechnologiessas.GPTCodeReviewPR` | GPT CodeReview PR metadata | Not found. |
| `JamesBurns-dev.GPTPullRequestReview` | GPT development alias | [linked](https://github.com/j-bur/azure-pipeline-gpt-pr-review) |
| `JumpInnovations.AIPRReview` | Jump review alias | [linked][jump] |
| `JumpInnovations.JumpWhisper` | JumpWhisper alias | [linked][jump] |
| `JustinPitcher.pria-azure` | Azure PRIA fork metadata | [linked](https://github.com/justinpitcher/pr-inspection-assistant) |
| `KK-VS.9b1568cf-d3da-4e5d-a2e5-e515e48417b0` | KK AI Code Reviewer metadata | Not found. |
| `kocsistem-ronesans.GPTPullRequestReview` | KocSistem alias | [upstream][gpt] |
| `kohta-jrits.GPTPullRequestReviewJP` | JP older alias | [linked](https://github.com/kohta-jrits/azure-pipeline-gpt-pr-review-jp) |
| `LawrenceShen.ai-pr-autoreview-extension` | AutoReview alias | [linked][autoreview] |
| `lcsrodriguesc.lcsrodriguesc` | Portuguese GPT alias | Not found. |
| `leonardobarchilonacs.BedrockPullRequestReview` | Bedrock title, OpenAI metadata conflict | [GPT upstream][gpt]; do not infer Bedrock implementation. |
| `leonardobarchilonacs.GPTPullRequestReview` | GPT alias | [upstream][gpt] |
| `MaXESteam.GPTPullRequestReviewer` | GPT reviewer metadata | [upstream][gpt] |
| `MMGuideBV.oaicr` | OpenAI review alias | [upstream][oaicr] |
| `mmr.GIA-AIPullRequestReview` | GIA alias | [linked][marcel] |
| `nanaya.GPTPullRequestReview-Fork` | GPT fork metadata | [upstream][gpt] |
| `pablomgg.d6db4b30-9b88-4a81-96bb-84201582f3fc` | AI PR Review alias | [linked][pablomgg] |
| `Paybyrd.pbopenai` | Paybyrd older alias | [upstream][oaicr] |
| `PretiusSoftware.openai-reviewer` | OpenAI Reviewer alias | Not found. |
| `PropelTechLabs.PropelGPTPRReviewer` | Propel GPT metadata | [upstream][gpt] |
| `RGBPlusTimPotze.AIPullRequestReview` | AI review fork metadata | [linked](https://github.com/ikkentim/azure-pipeline-ai-pr-review) |
| `Ruben-Nintex.GPTPullRequestReview` | GPT older alias | Not found. |
| `ShaneMorgan.AIPullRequestReview` | AI review fork metadata | [linked](https://github.com/ShaneOss/azure-pipeline-ai-pr-review) |
| `shazil.GPTPullRequestReviewTest` | GPT test alias | [upstream][gpt] |
| `Shipley-Capstone.Capstone-PR-GPT` | Capstone GPT metadata | Not found. |
| `SimoneBittiDev.GenAIAdvancedPRReviewer` | GenAI alpha alias | [upstream][genai] |
| `SRAI-Infra.AIPullRequestReviewPrompt` | Symphony prompt alias | [linked][symphony] |
| `SRAI-Infra.SAIPullRequestReviewPrompt` | Symphony prompt alias | [linked][symphony] |
| `TotvsHospitalidade-Desenvolvimento.lynn-hospitality-shield-pr` | LHS AI PR review metadata | Not found. |
| `TOYOTA-INDUSTORIES-IT-SOLUTIONS.pr-ai-reviewer` | PR reviewer metadata; spelling differs from next row | Placeholder GitHub URL, not source. |
| `TOYOTA-INDUSTRIES-IT-SOLUTIONS.pr-ai-reviewer` | Separate correctly spelled publisher identity | Placeholder GitHub URL, not source. |
| `ujwal-bhagat.GPTPullRequestReview` | GPT task metadata | Not found. |
| `ukaszGawin.SIGPTPullRequestReview` | SI GPT alias | Not found. |
| `Useall.GPTPullRequestReviewUseall` | Useall older alias | [upstream][gpt] |
| `wkiat97.GPTPullRequestReview` | GPT older alias | [upstream][gpt] |
| `yuanchuan23.AIPullRequestReview` | AI review metadata | Not found. |

Separately checked sparse historical listing:
[yuanchuan23.DSPullRequestReview](https://marketplace.visualstudio.com/items?itemName=yuanchuan23.DSPullRequestReview)
is **Pull Request Review Mate**, marked unpublished, with only an `overview`
description. Its AI providers/review features and source are unknown; its title
did not qualify it for the 306 text-filter candidates. Do not substitute the
similarly named AIPullRequestReview identity.

## 4. Adjacent/rejected candidates (X)

These were matched by the deliberately broad discovery filter but are not
counted as established automatic AI PR review engines. They can inspire supporting
UI/reporting, and are retained to make the search boundary explicit.

| Item ID | Why excluded from the reviewer inventory |
| --- | --- |
| `AB-IT.release-brief` | Release notes/brief generation rather than code review. |
| `AnsiByteCodeLLP.smart-workitem-creator` | Work-item generation, not established PR review. |
| `cost-guardrails-skyxops.cost-guardrails` | Infrastructure cost guardrails, not a general AI PR reviewer. |
| `d3nz1l-publisher.sonarqube-support-non-master` | SonarQube integration, not this survey's LLM review class. |
| `DanieleCas.azure-devops-mermaid-viewer` | Diagram rendering, not AI review. |
| `DynDevOps.D365-GitOps` | D365 GitOps automation, not an established AI reviewer here. |
| `dyngosz.azure-devops-mermaid-viewer` | Diagram renderer identity. |
| `FlintsLabs.azure-devops-mermaid-viewer` | Diagram renderer identity. |
| `FreemenLabs.vorsam-boards-ai-wizard` | AI work-item generation. |
| `FreemenLabs.work-item-generator` | Work-item generation. |
| `GiPStechsrl.VsMerMarkAzdevops` | Markdown/Mermaid viewer. |
| `IdeaRoost.sprint-planning-agent` | Planning/team assistant; no established PR-review engine in this pass. |
| `ikcasepilot.ai-testcase-generator` | Work-item test cases/backlog quality, not PR code review. |
| `jopereira.cmf-manual-validation-1` | Manual validation task. |
| `NeoFintechLab.pr-details` | PR details presentation, not established autonomous AI analysis. |
| `OddEssentials-Dev.ado-git-repo-insights-dev` | Repository/review analytics, not a general AI code reviewer. |
| `OddEssentials.ado-git-repo-insights` | Repository/review analytics, not a general AI code reviewer. |
| `realdolmen.EdTro-AzureDevOps-Extensions-ParentDetailsControl-Public` | Work-item parent-details control. |
| `ShubhamDwivedi.emr` | Markdown review/rendering, not established LLM PR review. |
| `WCOM.wcom-pullrequest-hub` | PR management hub; no established LLM review engine. |
| `xops.code-assistant-pr-usage-check` | Checks Copilot PR usage rather than performing code review. |
| `ZyaxAB.elf-size-analyze` | Binary-size analysis, not LLM code review. |
| `aatakansalar.auto-pr-chain` | PR creation/chaining automation, not established AI analysis. |

## 5. Reproducing and extending discovery

The public endpoint was:

`POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=7.2-preview.1`

Example request (replace the search value and page number):

```json
{
  "filters": [{
    "criteria": [
      { "filterType": 8, "value": "Microsoft.VisualStudio.Services.Cloud" },
      { "filterType": 10, "value": "review" }
    ],
    "pageNumber": 1,
    "pageSize": 250,
    "sortBy": 0,
    "sortOrder": 0
  }],
  "flags": 914
}
```

Follow `ResultCount` through all pages. Deduplicate publisher/extension IDs
case-insensitively, retaining latest `lastUpdated`. Inspect latest version's
`Microsoft.VisualStudio.Services.Content.Details` asset and Repository/GitHub
properties, not only search snippets. Preserve `unpublished`, missing-asset and
HTTP-error distinctions. Manually check seed URLs and search the web for
non-Marketplace integrations. The filter in this pass deliberately matched
`AI|GPT|Claude|Copilot|LLM|Bedrock|Gemini|Ollama|Flow Code|Panto|Scrutin|Guided PR|Diffsift`
and `review|pull request|PR agent` against name/short description, without word
boundaries, hence the explicitly rejected false positives.

Before refreshing, record the date; check whether archived aliases have a new
identity; review licenses and public source availability again. Do not turn a
404 into "closed source" or a screenshot/issue-link into "open source". Do not
copy source snippets/prompts from proprietary software into a new implementation.

[gpt]: https://github.com/mlarhrouch/azure-pipeline-gpt-pr-review
[ai]: https://github.com/97saundersj/azure-pipeline-ai-pr-review
[oaicr]: https://github.com/a1dancole/OpenAI-Code-Review
[genai]: https://github.com/abozaralizadeh/azure-pipeline-gpt-pr-review
[pria]: https://github.com/ewellnitz/pr-inspection-assistant
[littlefort]: https://github.com/little-fort/ado-copilot-code-review
[aquarela]: https://github.com/leonardobarchilonacs/updated-azdevops-pipeline-gpt-pr-review
[jpitapeva]: https://github.com/jpitapeva/azure-pipeline-gpt-pr-review
[cep]: https://github.com/juosilvaIos/CEP-OpenAI-Code-Review
[proxy]: https://github.com/fdelivamsft/azure-pipeline-gpt-pr-review-self
[pablomgg]: https://github.com/pablomgg/azure-pipeline-ai-pr-review
[marcel]: https://github.com/MarcelMulder-SPS/azure-pipeline-ai-pr-review
[turkish]: https://github.com/emre-maker-pixel/azure-pipeline-gpt-pr-review
[ptbr]: https://github.com/passarela/azure-pipeline-gpt-pr-review-pt-br
[autoreview]: https://github.com/lawrence8358/AI-PR-AutoReview
[jump]: https://github.com/michel-jump/azure-pipeline-ai-pr-review
[symphony]: https://github.com/symphonyretailai/azure-pipeline-gpt-pr-review

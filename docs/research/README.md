# Masthead - AI pull request review research

Project name: **Masthead**.

Research date: **2026-10-20**. Status: research, not an implementation decision.

## Start here

1. [Landscape and feature comparison](ai-pr-review-landscape.md) - conclusions,
   comparison against our requirements, the original nine candidates, additional
   products, and a reuse/contribution shortlist.
2. [Marketplace inventory](marketplace-inventory.md) - the long tail of listings,
   forks, unpublished products, unavailable descriptions, and source references.
3. [Architecture questions](architecture-and-next-steps.md) - PR hooks, ADO
   secrets, repository context, a review tab, provider/runtime options, and spikes.

## Important findings

- Most Marketplace reviewers are **pipeline tasks**, not organization-wide PR
  hook services. Installation alone does not activate reviews in every repository.
- **PR-Agent** and **Kodus** deserve investigation before building a new engine.
  Both have public source and Azure DevOps webhook integration. Kodus is
  TypeScript; PR-Agent is Python. Their licensing and operational footprints differ.
- **AI-Powered PR Comments**, **OpenCode AI Agent**, **ArcLight**, and
  **Little Fort's Copilot Code Review** are useful implementation references.
- **Conversational review is required:** answer authors in review threads, rerun
  automatically after new commits, and update/recheck existing findings rather
  than post a fresh duplicate review. Resolve verified fixes while preserving
  human decisions. See the landscape's conversation comparison and architecture
  lifecycle proposal; comment-triggered replies and push-triggered reviews need
  distinct handling.
- Actual PR tabs exist: **Guided PR Review**, **Agentic Code Reviewer**,
  **Scrutin**, **AI-assisted PR Review**, and **Azent** offer different examples.
  A dashboard or a summary comment is not automatically a PR tab.
- No product was verified to meet **all** requested features, especially the
  combination of no repository pipeline changes, broad BYOK support,
  repository-wide context, a PR tab, and provider keys kept as **ADO secrets**.
- A public repository is not necessarily open source. Some links are only to
  documentation, upstream code, or an issue tracker; some return 404.

## Evidence and limits

This is a public-documentation survey with selected source-code inspection. No
extension was installed, no private ADO instance was accessed, no paid service
was purchased, and no LLM credentials were used. Features are documented claims
unless explicitly identified as source-inspected. Review quality, security,
provider compatibility, and package/source equivalence remain untested.

The Marketplace was queried beyond the initial search, with every returned page
followed. The API also returned historical/unpublished and inaccessible records.
The inventory preserves those distinctions rather than calling every result an
available product. This is a broad dated inventory, **not a guarantee that every
extension or external integration in existence has been found**.

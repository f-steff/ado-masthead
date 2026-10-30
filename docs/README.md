# Masthead documentation

This folder is the engineering reference for Masthead. Start with the
[user README](../README.md) if you want to understand the product.

| Document | Purpose |
| --- | --- |
| [01-overview.md](01-overview.md) | Problem, goals, users and review model. |
| [02-requirements.md](02-requirements.md) | Required behavior and acceptance criteria. |
| [03-architecture.md](03-architecture.md) | Extension, broker, central pipeline and trust boundaries. |
| [04-review-lifecycle.md](04-review-lifecycle.md) | Events, author replies, re-reviews and finding state. |
| [05-review-types-and-prompts.md](05-review-types-and-prompts.md) | Lenses, examples, prompt rules and output contract. |
| [06-security-and-secrets.md](06-security-and-secrets.md) | Secrets, permissions, prompt injection and data handling. |
| [07-development.md](07-development.md) | Repository layout, build, tests and local gate. |
| [08-test-plan.md](08-test-plan.md) | Fixture strategy and planned ADO tests. |
| [09-license-review.md](09-license-review.md) | Target-code license and provenance review. |
| [10-publishing.md](10-publishing.md) | Editions, versioning and the OIDC release path. |
| [11-decisions.md](11-decisions.md) | Agreed decisions and open items. |

## Terms

- **Lens**: a selectable review type such as security or performance.
- **Profile**: the selected lenses and review-guide setting.
- **Finding**: a structured, actionable issue with a file and optional line.
- **Review guide**: the explanatory narrative in the PR tab.
- **Broker**: the small external receiver that queues a review when Azure
  DevOps sends a PR event.
- **Central pipeline**: Masthead's own review pipeline, not an application
  pipeline.

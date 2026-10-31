# 11 - Decisions

This is the working decision log. New decisions should be added with a date
and a short reason.

| # | Decision |
| --- | --- |
| D1 | Product name is **Masthead**. |
| D2 | Reviews start from PR events across selected projects, not application pipeline changes. |
| D3 | Two event-delivery modes are supported: native Incoming Webhook and an optional Docker broker. Both queue Masthead's central review pipeline. |
| D4 | Native mode avoids external hosting; broker mode is the secure option when public Incoming Webhook delivery is not acceptable. |
| D4a | The organization settings page provides a deploy/setup action for the selected mode and reports step-level health. |
| D4b | Each project lists every repository with an independent PR-review enable/disable switch; new repositories default to disabled. |
| D5 | Project settings gate which PRs are reviewed; optional branch policy can separately gate completion. |
| D6 | Correctness and impact is always enabled. Security, tests and license are on by default; performance, maintainability, data and dependencies are opt-in. |
| D7 | Data and dependency lenses are suggested by relevant paths but not auto-enabled. |
| D8 | The review guide is always available in the PR tab. |
| D9 | Authors can receive replies in Masthead-owned finding threads without pushing a commit. |
| D10 | New commits trigger re-review; verified fixes resolve Masthead-owned findings; human decisions are preserved. |
| D11 | Provider keys stay in ADO secret variables or a linked variable group. |
| D12 | The target repository license policy comes from its root LICENSE; missing LICENSE produces one warning. |
| D13 | License review is the AI license lens, not a separate scanner in the first implementation. |
| D14 | Masthead's own distribution remains MIT. The license lens is not a provenance gate for Masthead's source. |
| D15 | CI uses deterministic tests with mocked model output. Live model tests are opt-in and use environment keys. |
| D16 | Browser testing uses the dedicated debug Chrome profile and only tabs opened for Masthead. |
| D17 | Publishing follows the ado-static OIDC dev/stable model. GitHub and ADO credential setup is postponed. |

## Open items

- Broker deployment target and end-to-end verification; the Docker image is
  implemented but the local Docker daemon was not running during the first check.
- First UI slice for organization deploy action, project repository switches and
  the PR tab.
- Live compatibility checks for individual models, cost accounting and
  automated semantic grading of fixture evaluations.
- Persistent run locking and finding storage; the tested lifecycle layer
  currently creates action plans rather than publishing to ADO.
- Optional pipeline task design.
- ADO test project and repository seed.
- Marketplace metadata and release workflows.

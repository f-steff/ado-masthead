# 02 - Requirements

Status: agreed baseline for implementation. Items marked **postponed** depend
on credentials or the hosted service being available.

## Functional requirements

| ID | Requirement |
| --- | --- |
| FR-01 | Masthead starts reviews from PR created and updated events across selected projects and repositories. Application pipeline YAML is not changed. |
| FR-02 | Project settings can enable or disable reviews and choose repositories, target branches, draft handling, author exclusions and path exclusions. |
| FR-03 | The reviewer can read related unchanged files, callers, tests, manifests and repository instructions using bounded read-only tools. |
| FR-04 | A review produces structured findings and a short summary. |
| FR-05 | Critical and major findings can be posted as inline PR threads; unsupported anchors fall back to a file-level or general thread. |
| FR-06 | The PR tab shows a review guide, reviewed commit, coverage, limitations and current findings. |
| FR-07 | The license lens checks the reviewed repository, not Masthead. It reads the root LICENSE and reports one warning if it is missing. |
| FR-08 | Masthead answers author replies in its own finding threads without requiring a new commit. |
| FR-09 | New commits trigger re-review. Previous findings are rechecked, updated, resolved when verified fixed, and not duplicated. |
| FR-10 | Human threads and human resolutions are not automatically changed. |
| FR-11 | Review types are selectable; correctness and impact is mandatory, license is optional and on by default. |
| FR-12 | Model credentials are read from Azure DevOps secret variables or a linked variable group. |
| FR-13 | The system supports Anthropic, OpenAI and DeepSeek through a provider abstraction. |
| FR-14 | Review execution has token, turn, time and cost limits and can be cancelled when superseded. |
| FR-15 | An optional pipeline task can run a deeper or on-demand review later. |
| FR-16 | Publishing uses the same dev/stable OIDC model as ado-static. |
| FR-17 | The organization can choose native Incoming Webhooks or an optional Docker broker. |
| FR-18 | The organization settings page provides a deploy/setup action for the selected mode and reports connection health. |
| FR-19 | Each project lists its repositories with an individual enable/disable switch for PR reviews. |

## Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-01 | Prompt and repository content is untrusted data and cannot override the system contract. |
| NFR-02 | Review tools are read-only by default. No arbitrary shell, repository install script or plugin runs with secrets. |
| NFR-03 | Findings are deterministic to parse, validate and reconcile. Invalid model output is a failed review, not an empty success. |
| NFR-04 | Duplicate events and publication retries do not duplicate comments or replies. |
| NFR-05 | The system reports incomplete coverage, skipped files and budget exhaustion. |
| NFR-06 | No provider key is exposed to the extension iframe, PR data, logs or review artifacts. |
| NFR-07 | CI tests require no network or model key. Live model checks are opt-in. |
| NFR-08 | The code and documentation are ASCII-only and publishable without private identifiers. |

## Acceptance criteria for the first slice

- The lens catalogue, defaults and mandatory correctness rule are tested.
- The prompt builder includes only selected lenses and the output contract.
- Missing root LICENSE produces exactly one warning.
- Structured output parsing rejects malformed findings.
- Every lens has at least one positive and one negative fixture case.
- Typecheck, lint, tests and the clean-identifier scan pass locally.

# 01 - Overview

Masthead is an AI review service for Azure DevOps pull requests. It is named
for the masthead: the place from which a reviewer can see the whole vessel,
not only the nearest cable.

## The problem

A diff-only reviewer misses the code that gives the change meaning: callers,
contracts, tests, configuration and the repository's own rules. A useful review
must also continue after the first comment. Authors ask questions, push fixes
and disagree. A one-shot report creates noise and stale findings.

Application pipelines are also the wrong place to require every repository to
install a reviewer. It creates duplicated YAML, inconsistent versions and a
reason for teams not to adopt review at all.

## Goals

- Review PRs automatically without modifying application pipelines.
- Use repository context, not only the changed hunks.
- Make review types selectable and explainable.
- Keep findings stable across commits and resolve verified fixes.
- Let authors converse with the reviewer in the review thread.
- Keep model credentials in Azure DevOps secrets.
- Produce useful evidence without pretending to make legal or absolute
  correctness decisions.

## Non-goals

- Auto-merging or auto-approving pull requests.
- Modifying source branches or pushing fixes.
- Replacing human reviewers or making legal determinations.
- Supporting every model and every Azure DevOps feature in the first version.
- Requiring a pipeline in every reviewed repository.

## Users

- **Developer**: opens a PR, reads findings and asks follow-up questions.
- **Reviewer**: uses the guide and findings to focus human review.
- **Project administrator**: selects repositories, review types and policies.
- **Organization administrator**: installs Masthead and controls access.

## Principles

1. Prefer evidence over volume.
2. Review the change and what it affects, not unrelated old code.
3. Keep machine-readable state so re-reviews are continuous.
4. Separate trusted instructions from untrusted repository content.
5. Make the system's coverage and uncertainty visible.
6. Keep setup understandable to a team that has never used AI review.

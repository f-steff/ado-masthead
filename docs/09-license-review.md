# 09 - License review

## Purpose

The license lens protects the repository being reviewed. It looks for license
obligations and provenance evidence in the changed code and the surrounding
repository. It does not audit Masthead's own source.

## Repository policy

- Read the root `LICENSE` file.
- Common root names such as `LICENSE.md` and `COPYING` are accepted.
- A package manifest or package metadata is supplementary, not a substitute.
- If no root license file exists, emit one repository-level warning.
- Do not repeat the missing-license warning for each changed file.

If the license text cannot be identified confidently, warn and ask for human
confirmation instead of guessing.

## What the lens checks

- new and changed source files for SPDX identifiers, license headers and
  copyright statements;
- vendored, third-party, external and copied files;
- `LICENSE`, `NOTICE`, `COPYING` and attribution files;
- package manifests and lockfiles;
- assets and generated files with separate terms;
- files whose comments identify an upstream source but provide no license.

## What it does not claim

The lens cannot prove that unmarked code was copied from a particular project.
Without a source reference, license text or other evidence, it may report
"provenance unclear" but must not accuse the author or state a legal
conclusion.

## Finding shape

A license finding names:

- the file and line, package or repository-level source;
- the detected license or missing evidence;
- the repository policy it conflicts with;
- the obligation or uncertainty;
- the action: add attribution, add a notice, confirm source, replace the file,
  or obtain an exception.

## Test cases

Positive:

- `license-missing-root-license`;
- `license-gpl-file-in-mit-repository`.

Negative:

- `license-negative-mit-compatible`.

The executable license rule is in `src/review/license.ts`. The AI lens prompt
is assembled from `src/review/lenses.ts` and `src/review/prompt.ts`.

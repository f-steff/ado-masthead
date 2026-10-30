# 10 - Publishing

Release publication is prepared locally and intentionally disabled. The
repository variable `MARKETPLACE_PUBLISH_ENABLED` is `false`. CI and packaging
require no publishing identity or model credentials.

## Editions

| Edition | Extension ID | Source branch | Visibility |
| --- | --- | --- | --- |
| Stable | `masthead` | `main` | Public Marketplace listing. |
| Dev | `masthead-dev` | `develop` | Private, shared with test organizations. |

Publisher: `f-steff`.

## Versioning

Both editions share one tag sequence. A stable release publishes both at the
next minor version. A merge to `develop` publishes the next revision of the
current minor. Versions are derived from tags by the release scripts, not
edited by hand.

`ci/version.mjs` implements these rules. With no tags, dev starts at `0.0.1`
and the first stable release is `0.1.0`. A release tag is created only after
the first Marketplace upload succeeds. A stable publish tags that upload
before updating the private dev edition at the same version.

## Workflows

| File | Purpose |
| --- | --- |
| `ci.yml` | Required `build` check on every PR and main/develop push; packages a VSIX artifact without publishing. |
| `release-guard.yml` | Required `release-source` check; only the same repository's develop branch can target main. |
| `publish-dev.yml` | Publish the private dev edition on shipped-code changes in develop, or by manual dispatch. |
| `publish-stable.yml` | Publish stable and dev at the same version after shipped-code changes reach main. |
| `marketplace.yml` | Shared verification, packaging, OIDC, version/tag and publication steps. |
| `share-dev.yml` | Explicitly share or unshare the dev edition; organization input is masked. |

Runners use `ubuntu-24.04` and Node 22. Publishing is serialized across both
editions. Documentation-only changes do not mint versions. README is for
users; the packaged listing text is `marketplace-advertisement.md`.

Current VSIX packages contain an informational settings page and the review
core, not working PR integration. Successful local packaging is not a claim
that production deployment or Marketplace validation has been tested.

## Authentication

Publishing uses GitHub OIDC and a Microsoft Entra identity with a federated
credential for the `marketplace` environment. No long-lived Marketplace PAT is
stored in the repository.

The GitHub `marketplace` environment already exists with no credentials. It
uses the same default OIDC configuration and immutable repository subject as
the existing release setup. Do not copy its other repository's subject or IDs.

Before publishing:

1. Configure the publishing Entra application and publisher membership.
2. Add `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` as `marketplace` environment
   variables. A client secret and a Marketplace PAT are not needed.
3. Register a federated credential for this repository's exact OIDC subject.
   Read `sub_claim_prefix` from the repository's
   `actions/oidc/customization/sub` REST endpoint and append
   `:environment:marketplace`; do not assume the old name-only subject format.
4. Review the installable features, package contents and tests.
5. Set repository variable `MARKETPLACE_PUBLISH_ENABLED` to `true` only when
   release publication is intended.

These Entra and Marketplace setup steps are deferred. No provider keys are
needed for publication, and live review credentials are not copied to GitHub.

## Release gate

A publish runs only after:

1. typecheck;
2. lint;
3. deterministic tests;
4. the clean-identifier scan;
5. a production build;
6. packaging validation.

The license-review lens is a product feature; the repository itself still
keeps a valid LICENSE and third-party notices for its own dependencies.

## Postponed setup

- Configure the GitHub `marketplace` identity variables and Entra trust.
- Enable publication explicitly after the extension is ready.
- Share `masthead-dev` with the test organization.
- Publish and verify the private extension in the ADO test organization.

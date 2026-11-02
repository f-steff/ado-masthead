# 10 - Publishing

Release publication is configured and armed. The repository variable
`MARKETPLACE_PUBLISH_ENABLED` is `true`. CI and packaging require no publishing
identity or model credentials; only publication and sharing jobs use the
`marketplace` environment.

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

The GitHub `marketplace` environment uses this repository's own Entra identity;
it does not reuse Static's client ID or federated subject. The environment holds
`AZURE_CLIENT_ID` and `AZURE_TENANT_ID` as variables. It has no environment
secrets and no long-lived Marketplace PAT.

The identity has a federated credential for the immutable subject
`repo:f-steff@7275320/ado-masthead@1440330013:environment:marketplace`. It is a
Contributor on publisher `f-steff`, which allows it to publish both the stable
and dev editions. A read-only GitHub Actions OIDC check authenticated
successfully and returned the expected Azure DevOps profile.

The environment has no approval or branch protection rules, matching Static's
setup. The environment name in the workflow and the federated subject must stay
identical.

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

## Remaining activation

Configuration alone does not publish anything. The publish workflows must be
present on their target branches and receive a shipped-code change.

1. Merge the implementation into `develop`. This publishes the private
   `masthead-dev` edition after the local gate passes.
2. Share `masthead-dev` with the test organization, then install the private
   extension there. Until the workflow files are on `main`, use the publisher
   page's **Share/Unshare** action. GitHub only exposes manual workflows from
   the default branch, so **Share dev** appears after the first release to
   `main`.
3. Merge a release into `main` only after the installable features are ready.
   That publishes stable and dev at the same version.
4. Verify both listings and the Azure DevOps installation in the test
   organization.

The first dev publish creates the private listing. The first stable publish
creates the public listing. No provider keys are needed for publication, and
live review credentials are not copied to GitHub.

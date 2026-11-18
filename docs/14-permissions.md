# Permissions

Masthead requests organization-level scopes because it configures organization
and project settings and can install its own review pipeline. Azure DevOps marks
two of the requested scopes as **High privilege**. That badge is expected and is
not a sign that Masthead uses the full scope for routine reviews.

The extension requests the following scopes. The organization settings page
shows the same list under its **Permissions** tab, with a short explanation for
each scope.

| Scope | Azure DevOps name | High privilege | Why Masthead needs it |
| --- | --- | --- | --- |
| `vso.code_write` | Code (read and write) | Yes | Commits the bundled Masthead pipeline YAML to the trusted repository selected by an administrator, and creates or removes only the Masthead status policy on a repository default branch. |
| `vso.build_execute` | Build (read and execute) | Yes | Creates or deletes the Masthead review pipeline definition. The scope can queue builds, but the extension does not queue builds from the browser. |
| `vso.build` | Build (read) | No | Lists and validates pipeline definitions during setup. Included in Build (read and execute), and listed separately for clarity. |
| `vso.code` | Code (read) | No | Reads pull requests, changed files, related files and code-search results, and receives pull request events through service hooks. Included in Code (read and write), and listed separately for clarity. |
| `vso.extension.data_write` | Extension data (read and write) | No | Stores organization and project settings, the cached model catalogue and the short-lived revision lock. Provider keys are not stored here. |
| `vso.project` | Project and team (read) | No | Lists projects and repositories so administrators can configure review gates and policies. |

Code and Build also inherit **Service hooks (read and write)**. Masthead uses
that inherited access only to create and remove its own pull request event
subscriptions.

## What Masthead does not do

- It does not push application source branches or pull request branches.
- It does not approve, vote on, complete or merge pull requests.
- It does not edit pipelines other than the review pipeline an administrator
  creates through Setup.
- It does not edit branch policies other than the Masthead status policy.
- It does not request work item, release, agent pool, service connection,
  identity or organization administration scopes.
- It does not store provider keys in extension data or in browser storage.

The Code (read and write) scope is broader than the two write actions Masthead
performs. Azure DevOps has no scope limited to pipeline YAML deployment and
branch-policy management. Masthead constrains its own use to those actions and
rejects paths outside the selected trusted repository.

The Build (read and execute) scope is also broader than definition management.
The extension does not queue builds; reviews are queued by the native service
hook, the optional broker, or a manual pipeline run.

## Installation and consent

The high privilege badge appears in the Azure DevOps extension details before
and after installation. An organization administrator must approve the
extension. The scopes are installation scopes: they are not granted separately
per feature after installation.

If an organization cannot grant these scopes, it should not install the
extension. The review worker can still be run from a manually created pipeline,
but the extension cannot provide its settings UI or administrator actions. Use
the manual pipeline setup in [ado-pipelines/README.md](../ado-pipelines/README.md)
in that case.

## Related documents

- [Security and secrets](06-security-and-secrets.md)
- [First review run](12-first-review-run.md)
- [Trusted pipeline setup](../ado-pipelines/README.md)

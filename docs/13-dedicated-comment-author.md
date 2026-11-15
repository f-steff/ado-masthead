# Dedicated comment author

By default the central pipeline authenticates with `SYSTEM_ACCESSTOKEN`, so
review comments and statuses appear as the project build service. A dedicated
comment author makes Masthead's activity easy to identify and lets access be
rotated independently from the pipeline definition.

This is an optional deployment choice. The extension does not create the
account, the PAT or the variable group.

## Identity and access

Use a dedicated Azure DevOps user account, not a personal account.

1. Add the account to the organization with Basic access. Stakeholder access is
   not sufficient to read repositories and contribute to pull request threads.
2. Add the account to each reviewed project. Do not add it to Project
   Administrators.
3. At repository level grant only:
   - **Read**;
   - **Contribute to pull requests**.
4. Do not grant **Contribute**, **Force push**, branch-policy administration or
   pipeline administration. Masthead does not push source branches.

The account also reads Masthead settings and takes the revision lock through
extension data. If the pipeline uses extension data rather than a settings
snapshot, grant the account access to that data through the PAT scopes below.

When the project enables **Limit job authorization scope to referenced Azure
DevOps repositories**, the pipeline's `SYSTEM_ACCESSTOKEN` cannot read a fork
repository that is not referenced by the pipeline. Fork pull requests then need
`MASTHEAD_ADO_TOKEN` for an account with read access to the fork. Do not disable
the scoping setting just to review forks.

## PAT scope and storage

Create a PAT for the dedicated account with:

- **Code (read and write)** so the worker can read pull request content and
  write threads and statuses;
- **Extension Data (read and write)** when the pipeline reads settings or uses
  the revision lock;
- organization scope limited to the reviewed organization;
- the shortest practical expiry, normally 30 to 90 days.

Store the PAT as the secret variable `MASTHEAD_ADO_TOKEN` in the
`masthead-secrets` variable group. Never put it in extension settings, a
repository file, a pipeline parameter or a log.

The worker prefers `MASTHEAD_ADO_TOKEN`. When it is absent or empty, the worker
falls back to `SYSTEM_ACCESSTOKEN` and comments appear as the build service.

Code (read and write) is broader than comments alone because Azure DevOps has no
PAT scope limited to pull request threads. Treat the PAT as a code-write
credential even though Masthead does not push code.

## Verify the author

1. Run a forced review on a test pull request.
2. Confirm the new inline comments and the summary thread are authored by the
   dedicated account.
3. Confirm the review status is posted by the same identity.
4. Check that the pipeline can still read organization and project settings.

## Change or rotate the author

Finding markers and run markers are trusted only when the comment author matches
the current authenticated identity. If you switch authors, existing threads from
the previous identity are ignored and the new identity can create a second set
of findings on the same revision.

For a clean transition:

1. Run the new identity on a test pull request first.
2. Resolve or close old Masthead threads that should not remain open.
3. Keep the old identity available until active pull requests have been
   reconciled, or accept that historical markers will not be reused.
4. Remove the old PAT after verification.

For routine rotation:

1. Create the replacement PAT.
2. Update `MASTHEAD_ADO_TOKEN` in the secret variable group.
3. Run a forced review and confirm authorship and settings access.
4. Revoke the previous PAT.
5. Record the new expiry date in the deployment notes.

If a PAT is exposed, revoke it first, then update the variable group. Disabling
the account also stops outstanding tokens.

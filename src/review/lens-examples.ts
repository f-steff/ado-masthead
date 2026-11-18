// Short, synthetic examples for the in-product lens guide. They demonstrate
// the review contract without reproducing any real pull request or repository.
// Examples use C and C build files so the guide matches the reviewed code base.
import type { ReviewLensId } from "./lenses";

export interface LensExampleCase {
  name: string;
  input: string;
  output: string;
}

export interface LensExample {
  whenToUse: string;
  cases: LensExampleCase[];
}

export const LENS_EXAMPLES: Record<ReviewLensId, LensExample> = {
  correctness: {
    whenToUse: "Use this on every review. It is the baseline lens for changed behavior, callers and edge cases.",
    cases: [
      {
        name: "Optional value is dereferenced",
        input: `src/profile.c
+ char *normalize_email(const struct user *user) {
+   return strdup(user->profile->email);
+ }`,
        output: `src/profile.c:2 - Major, high confidence
Trigger: profile is optional in struct user, but the new code dereferences it without a check.
Consequence: a user without a profile crashes before the email is normalized.
Suggestion: check user and user->profile, then return an empty value or a documented fallback.`
      },
      {
        name: "Off-by-one loop",
        input: `src/items.c
+ for (size_t i = 0; i <= items->count; ++i) {
+   items->values[i] = 0;
+ }`,
        output: `src/items.c:1 - Major, high confidence
Trigger: the loop condition includes index count.
Consequence: the loop writes one element past the allocated values array and can corrupt the heap.
Suggestion: use i < items->count, or a bounds-checked helper that rejects count outside the allocation.`
      },
      {
        name: "Ignored write result",
        input: `src/io.c
+ write(fd, buffer, length);
+ close(fd);
+ return 0;`,
        output: `src/io.c:1 - Major, high confidence
Trigger: write can return a short count or an error, but the result is discarded.
Consequence: the caller reports success even when only part of the payload was written.
Suggestion: loop until the full buffer is written and return the error or short-write result to the caller.`
      }
    ]
  },
  security: {
    whenToUse: "Use this when a change crosses a trust boundary, handles credentials or personal data, or reaches SQL, commands, templates or file paths.",
    cases: [
      {
        name: "SQL built from request input",
        input: `src/query.c
+ char *sql = sqlite3_mprintf(
+     "SELECT * FROM users WHERE id = '%s'", id);
+ return db_query(sql);`,
        output: `src/query.c:2 - Critical, high confidence
Trigger: id comes from the request and is interpolated into SQL.
Consequence: an attacker can change the query and read or modify other rows.
Suggestion: use a prepared statement and bind id as a query parameter.`
      },
      {
        name: "Path traversal",
        input: `src/files.c
+ snprintf(path, sizeof path, "/srv/files/%s", name);
+ FILE *file = fopen(path, "r");`,
        output: `src/files.c:2 - Critical, high confidence
Trigger: name comes from the request and is appended to the upload root without validation.
Consequence: a value such as ../../etc/passwd reads files outside /srv/files.
Suggestion: reject path separators and parent segments, or use openat with a validated relative path.`
      }
    ]
  },
  tests: {
    whenToUse: "Use this when behavior changes, a test is changed, or a new branch or failure mode is introduced.",
    cases: [
      {
        name: "Regression assertion removed",
        input: `test/profile_test.c
- assert_true(normalize_email(NULL) == NULL);
+ /* removed while the function is rewritten */`,
        output: `test/profile_test.c:1 - Minor, high confidence
Trigger: the only assertion for the optional-profile path was removed.
Consequence: the null-profile path no longer has a regression guard.
Suggestion: keep a test for the guarded path and add an explicit assertion for the fallback value.`
      },
      {
        name: "New branch has no test",
        input: `src/frame.c
+ if (frame->len == 0) {
+   return -EINVAL;
+ }

test/frame_test.c
+ /* only nonempty frames are tested */`,
        output: `test/frame_test.c:1 - Minor, high confidence
Trigger: the change adds a zero-length failure branch, but no test exercises it.
Consequence: a later change can remove or invert the branch without a failing test.
Suggestion: add a test that passes an empty frame and asserts the error and unchanged state.`
      }
    ]
  },
  license: {
    whenToUse: "Use this when files are added from another source, dependencies change, or the repository's license and notice obligations need a review.",
    cases: [
      {
        name: "Vendored file without provenance",
        input: `src/vendor/chart.c
+ /* chart drawing */
+ void draw_chart(const struct chart *chart) { ... }`,
        output: `src/vendor/chart.c:1 - Warning, medium confidence
Trigger: a vendored file was added with no copyright, license header or source reference.
Consequence: the repository may be missing attribution or compatible terms for this code.
Suggestion: identify the upstream project and license, add the required notice, and confirm redistribution terms.`
      },
      {
        name: "Conflicting license header",
        input: `src/vendor/parser.c
+ // SPDX-License-Identifier: GPL-3.0-or-later
+ /* copied from an external parser */
+ int parse_record(const char *input) { ... }`,
        output: `src/vendor/parser.c:1 - Warning, medium confidence
Trigger: a new vendored file declares GPL-3.0-or-later while the repository declares MIT.
Consequence: combining and distributing the file may conflict with the repository's stated terms.
Suggestion: identify the exact upstream source and obligations, and replace it or add the required notices before distribution.`
      }
    ]
  },
  performance: {
    whenToUse: "Use this when a change affects request paths, database access, large collections, caching or other work that grows with input.",
    cases: [
      {
        name: "Repeated length scan",
        input: `src/report.c
+ for (size_t i = 0; i < strlen(text); ++i) {
+   out[i] = toupper((unsigned char)text[i]);
+ }`,
        output: `src/report.c:1 - Major, high confidence
Trigger: strlen scans the full string on every loop iteration.
Consequence: the transform becomes quadratic in input size and can dominate large reports.
Suggestion: compute the length once before the loop, or iterate until the terminating NUL.`
      },
      {
        name: "Query per order",
        input: `src/orders.c
+ for (size_t i = 0; i < order_count; ++i) {
+   orders[i].customer = db_find_customer(db, orders[i].customer_id);
+ }`,
        output: `src/orders.c:2 - Major, high confidence
Trigger: one customer query runs for every order.
Consequence: database round trips grow with the result size and can dominate this request.
Suggestion: collect the customer ids and fetch them in one query, or include the relation in the initial query.`
      }
    ]
  },
  maintainability: {
    whenToUse: "Use this when a change adds control flow, duplicates a rule, or makes the affected code harder to change safely.",
    cases: [
      {
        name: "Duplicated validation rule",
        input: `src/request.c
+ if (req->method == HTTP_POST && req->body == NULL) {
+   return -EINVAL;
+ }
+ ...
+ if (req->method == HTTP_POST && req->body == NULL) {
+   return -EINVAL;
+ }`,
        output: `src/request.c:5 - Minor, high confidence
Trigger: the same request validation is written twice in one path.
Consequence: a future rule change can update one copy and leave the other inconsistent.
Suggestion: move the check into the existing request_validate helper and call it once.`
      },
      {
        name: "Confusing cleanup path",
        input: `src/session.c
+ if (session) {
+   if (session->user) {
+     if (session->user->token) {
+       revoke(session->user->token);
+     } else {
+       free(session);
+       return;
+     }
+   } else {
+     free(session);
+     return;
+   }
+ }
+ free(session);`,
        output: `src/session.c:1 - Minor, high confidence
Trigger: cleanup is repeated in several nested branches and then again at the end.
Consequence: a future early return can skip or repeat free, causing a leak or double free.
Suggestion: use one cleanup label and a single free path after the nested checks.`
      }
    ]
  },
  architecture: {
    whenToUse: "Use this when a change crosses an existing layer, bypasses an established helper, or changes a shared contract. The correctness lens covers behavior; this lens covers conformance to the repository's design.",
    cases: [
      {
        name: "Presentation layer reaches into persistence",
        input: `src/ui/report_view.c
+ #include "db/internal.h"
+ void render_report(void) {
+   sqlite3_stmt *stmt = db_prepare_internal("SELECT ...");
+   ...
+ }`,
        output: `src/ui/report_view.c:2 - Major, medium confidence
Trigger: the UI layer now calls private database internals instead of the existing report_service API.
Consequence: the UI bypasses transaction and validation rules, and a schema change can break the view directly.
Suggestion: call report_service_list_reports and keep database access inside the persistence layer.`
      },
      {
        name: "Configuration helper bypassed",
        input: `src/http/handler.c
+ const char *dsn = getenv("DATABASE_URL");
+ db_connect(dsn);`,
        output: `src/http/handler.c:1 - Major, medium confidence
Trigger: the new path reads DATABASE_URL directly, while the repository resolves configuration through config_get_string.
Consequence: this path ignores the existing validation and defaults, so one deployment source can silently differ from the rest.
Suggestion: use config_get_string("database.dsn") and the existing connection helper.`
      }
    ]
  },
  data: {
    whenToUse: "Use this for schema changes, data movement, migrations, backfills and changes that must survive a rolling deployment.",
    cases: [
      {
        name: "Destructive column drop",
        input: `migrations/042_drop_customer_notes.sql
+ ALTER TABLE customers DROP COLUMN notes;
+ -- No backfill or retention period.`,
        output: `migrations/042_drop_customer_notes.sql:1 - Major, high confidence
Trigger: a populated column is dropped in the same release that stops reading it.
Consequence: customer notes are permanently lost and rollback cannot restore them.
Suggestion: retain the column for a compatibility window, back up the data, and drop it only after the new path is verified.`
      },
      {
        name: "Required column without a backfill",
        input: `migrations/043_add_customer_region.sql
+ ALTER TABLE customers ADD COLUMN region TEXT NOT NULL;`,
        output: `migrations/043_add_customer_region.sql:1 - Major, high confidence
Trigger: the migration adds a required column without a default or backfill.
Consequence: existing rows fail the migration, and a locked table can block writes during rollout.
Suggestion: add the column as nullable, backfill it in batches, then enforce NOT NULL in a later migration.`
      }
    ]
  },
  dependencies: {
    whenToUse: "Use this when packages, lockfiles, build steps, containers, infrastructure or pipeline configuration change.",
    cases: [
      {
        name: "Remote script during build",
        input: `CMakeLists.txt
+ execute_process(COMMAND bash -c
+   "curl -fsSL https://downloads.example.test/setup.sh | sh")`,
        output: `CMakeLists.txt:1 - Major, high confidence
Trigger: configuration executes a remote script fetched from an unversioned URL.
Consequence: the build can run unreviewed code with repository and CI credentials.
Suggestion: pin a reviewed artifact or dependency, verify its checksum, and avoid network install scripts.`
      },
      {
        name: "Unpinned build dependency",
        input: `CMakeLists.txt
+ FetchContent_Declare(json
+   GIT_REPOSITORY https://example.test/json.git
+   GIT_TAG main)`,
        output: `CMakeLists.txt:1 - Warning, high confidence
Trigger: the build fetches a moving branch instead of a fixed commit or release.
Consequence: the same source revision can build with different dependency content and hide a supply-chain change.
Suggestion: fetch a tagged release or pinned commit and record the expected checksum or lockfile.`
      }
    ]
  }
};

// Manual/pipeline entry point for one pull-request review.
import { runReviewJob } from "./review-job";

void runReviewJob(process.env).catch((error: unknown) => {
  // Provider and ADO adapters already sanitize response bodies and credentials.
  console.error(error instanceof Error ? error.message : "Review failed.");
  process.exitCode = 1;
});

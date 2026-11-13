// Event-driven pipeline entry point. The broker or a native webhook pipeline
// passes only identifiers; this router chooses review or reply and never trusts
// event text as instructions.
import { isCommentEvent, isReviewEvent, parseEventEnvelope } from "./event-envelope";
import { runReplyJob } from "./reply";
import { runReviewJob } from "./review-job";

async function main(): Promise<void> {
  const envelope = parseEventEnvelope(process.env);
  console.log(JSON.stringify({
    eventType: envelope.eventType,
    ...(envelope.deliveryKey ? { deliveryKey: envelope.deliveryKey } : {})
  }));
  if (isCommentEvent(envelope.eventType)) {
    await runReplyJob(process.env, envelope);
    return;
  }
  if (isReviewEvent(envelope.eventType)) {
    await runReviewJob(process.env);
    return;
  }
  throw new Error("Unsupported event type.");
}

void main().catch((error: unknown) => {
  // Provider and ADO adapters already sanitize response bodies and credentials.
  console.error(error instanceof Error ? error.message : "Event failed.");
  process.exitCode = 1;
});

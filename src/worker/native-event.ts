// Native incoming-webhook entry point. The pipeline passes the raw service-hook
// payload; the shared normalizer extracts only identifiers before dispatch.
import { normalizeEvent } from "../../broker/lib.mjs";
import { isCommentEvent } from "./event-envelope";
import { nativeEventEnvironment } from "./native-event-envelope";
import { runReplyJob } from "./reply";
import { runReviewJob } from "./review-job";

async function main(): Promise<void> {
  const raw = (process.env.MASTHEAD_EVENT_JSON || "").trim();
  if (!raw) throw new Error("Set MASTHEAD_EVENT_JSON for a native webhook run.");
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("MASTHEAD_EVENT_JSON is not valid JSON.");
  }
  const event = normalizeEvent(payload);
  const { env, envelope } = nativeEventEnvironment(process.env, event);
  console.log(JSON.stringify({ eventType: envelope.eventType, deliveryKey: envelope.deliveryKey }));
  if (isCommentEvent(envelope.eventType)) {
    await runReplyJob(env, envelope);
    return;
  }
  await runReviewJob(env);
}

void main().catch((error: unknown) => {
  // ADO and provider adapters already sanitize response bodies and credentials.
  console.error(error instanceof Error ? error.message : "Native event failed.");
  process.exitCode = 1;
});

// Importable HTTP receiver: tests use a fake queue endpoint, never real ADO credentials.
import { createServer } from "node:http";
import { buildQueueBody, isAuthorized, parseEvent, queueUrl } from "./lib.mjs";

/** Authentication, bounded input and retry-safe queueing apply before any ADO write. */
export function createBroker(config, { fetchImpl = fetch, now = Date.now } = {}) {
  if (typeof config.secret !== "string" || config.secret.length < 32 || !config.token) {
    throw new Error("A broker secret of at least 32 characters and a queue token are required.");
  }
  // Validate the fixed target before listening, so no payload can choose a different pipeline.
  buildQueueBody({}, config.pipelineId);
  const target = queueUrl(config.org, config.project);
  const seen = new Map();
  const ttl = config.dedupeMs ?? 300_000;
  const maxEntries = config.maxEntries ?? 10_000;
  const maxBytes = config.maxBytes ?? 1_048_576;
  const timeoutMs = config.queueTimeoutMs ?? 30_000;
  if (![ttl, maxEntries, maxBytes, timeoutMs].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error("Broker limits must be positive integers.");
  }

  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") return send(response, 200, { status: "ok" });
    if (request.method !== "POST" || request.url !== "/event") return send(response, 404, { error: "not found" });
    if (!isAuthorized(request.headers, config.secret)) return send(response, 401, { error: "unauthorized" });
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      return send(response, 415, { error: "JSON content type required" });
    }
    let event;
    try {
      event = parseEvent(await readBody(request, maxBytes), maxBytes);
    } catch {
      // Do not echo JSON parsing errors or request content into an unaudited log.
      return send(response, 400, { error: "invalid webhook event" });
    }
    for (const [key, item] of seen) {
      if (item.state === "queued" && item.expires <= now()) seen.delete(key);
    }
    const prior = seen.get(event.deliveryKey);
    if (prior?.state === "queued") return send(response, 202, { status: "duplicate" });
    // A pending delivery might fail; ask overlapping deliveries to retry rather than lose them.
    if (prior) return send(response, 503, { error: "delivery in progress" });
    if (seen.size >= maxEntries) return send(response, 429, { error: "broker capacity reached" });
    seen.set(event.deliveryKey, { state: "pending", expires: now() + ttl });
    try {
      const queued = await fetchImpl(target, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Basic ${Buffer.from(`:${config.token}`).toString("base64")}`
        },
        body: JSON.stringify(buildQueueBody(event, config.pipelineId)),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!queued.ok) throw new Error("Queue request failed.");
      const build = await queued.json();
      if (!Number.isSafeInteger(build.id) || build.id <= 0) throw new Error("Invalid queue response.");
      seen.set(event.deliveryKey, { state: "queued", expires: now() + ttl });
      return send(response, 202, { status: "queued" });
    } catch {
      seen.delete(event.deliveryKey);
      return send(response, 502, { error: "unable to queue review" });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}

/** Limit raw bytes while streaming, before creating a parsed JSON object. */
async function readBody(request, maxBytes) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error("Body too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Responses contain fixed status text only, never credentials or request data. */
function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json", ...(status === 503 ? { "retry-after": "1" } : {}) });
  response.end(JSON.stringify(body));
}

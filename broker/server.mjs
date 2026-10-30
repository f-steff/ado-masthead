// Minimal HTTP receiver for Azure DevOps service hooks. It deliberately has no
// provider SDK or repository access; its only privilege is queueing one fixed
// Masthead pipeline.
import { createServer } from "node:http";
import { isAuthorized, parseEvent, buildQueueBody, queueUrl } from "./lib.mjs";

const port = Number(process.env.PORT || 8080);
const secret = process.env.MASTHEAD_BROKER_SECRET || "";
const org = process.env.MASTHEAD_ADO_ORG || "";
const project = process.env.MASTHEAD_ADO_PROJECT || "";
const pipelineId = process.env.MASTHEAD_PIPELINE_ID || "";
const adoToken = process.env.MASTHEAD_ADO_TOKEN || "";
const seen = new Map();
const DEDUPE_MS = 5 * 60 * 1000;

if (!secret || !org || !project || !pipelineId || !adoToken) {
  console.error("Missing one of MASTHEAD_BROKER_SECRET, MASTHEAD_ADO_ORG, MASTHEAD_ADO_PROJECT, MASTHEAD_PIPELINE_ID, MASTHEAD_ADO_TOKEN.");
  process.exit(1);
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    send(response, 200, { status: "ok" });
    return;
  }

  if (request.method !== "POST" || request.url !== "/event") {
    send(response, 404, { error: "not found" });
    return;
  }

  if (!isAuthorized(request.headers, secret)) {
    send(response, 401, { error: "unauthorized" });
    return;
  }

  try {
    const raw = await readBody(request);
    const event = parseEvent(raw);
    if (seen.has(event.deliveryKey)) {
      send(response, 202, { status: "duplicate" });
      return;
    }
    seen.set(event.deliveryKey, Date.now());
    pruneSeen();

    const result = await fetch(queueUrl(org, project), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`:${adoToken}`).toString("base64")}`
      },
      body: JSON.stringify(buildQueueBody(event, pipelineId))
    });

    if (!result.ok) {
      // Provider and ADO response bodies are not logged because they can contain
      // private payload details. Status is enough for operational diagnosis.
      send(response, 502, { error: `azure devops returned ${result.status}` });
      return;
    }

    send(response, 202, { status: "queued" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid event";
    send(response, 400, { error: message });
  }
});

server.listen(port, () => {
  console.log(`Masthead broker listening on port ${port}.`);
});

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Webhook body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function pruneSeen() {
  const cutoff = Date.now() - DEDUPE_MS;
  for (const [key, time] of seen) {
    if (time < cutoff) {
      seen.delete(key);
    }
  }
}

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

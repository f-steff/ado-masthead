// Credentials remain process-local; starting this entry point is an explicit operator action.
import { createBroker } from "./app.mjs";

try {
  const port = Number(process.env.PORT ?? "8080");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port.");
  const server = createBroker({
    secret: process.env.MASTHEAD_BROKER_SECRET,
    org: process.env.MASTHEAD_ADO_ORG,
    project: process.env.MASTHEAD_ADO_PROJECT,
    pipelineId: process.env.MASTHEAD_PIPELINE_ID,
    token: process.env.MASTHEAD_ADO_TOKEN
  });
  server.listen(port, () => console.log(`Masthead broker listening on port ${port}.`));
} catch {
  console.error("Broker configuration is invalid. Check the required environment variables and limits.");
  process.exitCode = 1;
}

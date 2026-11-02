// The review identity is chosen once and used for both settings reads and
// thread publication. A dedicated service identity can be supplied as a PAT so
// comments do not have to appear as the project build service.
export interface AdoAuth {
  token: string;
  scheme: "basic" | "bearer";
  source: "dedicated" | "system" | "local";
}

export function resolveAdoAuth(env: NodeJS.ProcessEnv): AdoAuth {
  const dedicated = (env.MASTHEAD_ADO_TOKEN || "").trim();
  if (dedicated) {
    return { token: dedicated, scheme: "basic", source: "dedicated" };
  }
  const system = (env.SYSTEM_ACCESSTOKEN || "").trim();
  if (system) {
    return { token: system, scheme: "bearer", source: "system" };
  }
  const local = (env.AZURE_DEVOPS_TOKEN || "").trim();
  if (local) {
    return { token: local, scheme: "basic", source: "local" };
  }
  throw new Error("Set MASTHEAD_ADO_TOKEN, SYSTEM_ACCESSTOKEN or AZURE_DEVOPS_TOKEN.");
}

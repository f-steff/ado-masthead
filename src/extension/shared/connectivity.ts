// Lightweight connectivity probe for the settings pages. It checks the
// Azure DevOps REST endpoint with the extension token, not just the iframe
// handshake, so a lost or restored connection is visible in the header chip.
export type HostConnectionState = "connecting" | "connected" | "disconnected";

export interface HostConnectionCheckOptions {
  organizationUrl: string;
  getToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface HostConnectionResult {
  state: Exclude<HostConnectionState, "connecting">;
  checkedAt: Date;
}

/** Probe one lightweight project endpoint; any HTTP or network failure is disconnected. */
export async function checkHostConnection(
  options: HostConnectionCheckOptions
): Promise<HostConnectionResult> {
  const checkedAt = new Date();
  try {
    const token = (await options.getToken()).trim();
    if (!token) return { state: "disconnected", checkedAt };
    const base = options.organizationUrl.replace(/\/+$/, "");
    const response = await (options.fetchImpl ?? fetch)(
      `${base}/_apis/projects?$top=1&api-version=7.1`,
      {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
        redirect: "error"
      }
    );
    return { state: response.ok ? "connected" : "disconnected", checkedAt };
  } catch {
    return { state: "disconnected", checkedAt };
  }
}

export interface HostConnectionMonitorOptions extends HostConnectionCheckOptions {
  intervalMs?: number;
  onState: (state: HostConnectionState, checkedAt?: Date) => void;
}

/**
 * Start the browser monitor. It checks immediately, then on an interval and
 * whenever the browser comes back online or the page becomes visible.
 */
export function startHostConnectionMonitor(
  options: HostConnectionMonitorOptions
): { checkNow: () => Promise<void>; stop: () => void } {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { checkNow: async () => undefined, stop: () => undefined };
  }
  let stopped = false;
  let inFlight = false;
  const check = async (): Promise<void> => {
    if (stopped || inFlight) return;
    inFlight = true;
    const result = await checkHostConnection(options);
    inFlight = false;
    if (!stopped) options.onState(result.state, result.checkedAt);
  };
  const onOnline = (): void => { void check(); };
  const onVisibility = (): void => {
    if (document.visibilityState === "visible") void check();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  options.onState("connecting");
  void check();
  const timer = window.setInterval(() => { void check(); }, options.intervalMs ?? 30_000);
  return {
    checkNow: check,
    stop: () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}

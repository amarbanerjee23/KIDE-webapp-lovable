export interface RemoteActivity {
  name: string;
  capabilityUri: string;
}

export interface RemoteMachineTransition {
  source: string;
  target: string;
  event?: string | null;
}

export interface RemoteCapabilityMachine {
  capabilityUri: string;
  sessionType?: string | null;
  states: string[];
  startStates: string[];
  endStates: string[];
  transitions: RemoteMachineTransition[];
}

export interface RemoteExecutionGroup {
  kind: "sequential" | "parallel";
  activities: string[];
}

export interface RemoteSynthesisRequest {
  projectId: string;
  activities: RemoteActivity[];
  capabilityMachines: RemoteCapabilityMachine[];
  executionPlan?: RemoteExecutionGroup[];
}

export interface RemoteSynthesisProgress {
  stage?: string;
  percent?: number;
}

export interface RemoteController {
  deviceUri: string;
  activities: string[];
  states: string[];
  startStates: string[];
  endStates: string[];
  transitions: unknown[];
}

export interface RemoteSynthesisResult {
  projectId: string;
  status: "completed";
  algorithm: string;
  bindings: unknown[];
  controllers: RemoteController[];
  coordination: unknown[];
  parallelGroups: unknown[];
  executionPlan: RemoteExecutionGroup[];
  evidence: {
    semanticSource: string;
    deterministicOrdering: boolean;
    resolvedActivities: number;
    sessionTypesValidated: number;
    syntheticTransitions: number;
    crossDeviceCoordinations: number;
    parallelGroups: number;
  };
}

export interface RemoteSynthesisJob {
  jobId: string;
  status: string;
  progress?: RemoteSynthesisProgress;
  result?: RemoteSynthesisResult;
  error?: string;
}

export interface RemoteSynthesisHandlers {
  onUpdate: (job: RemoteSynthesisJob) => void;
  onError?: (error: Error) => void;
}

const POLL_INTERVAL_MS = 1_000;

function apiBase(): string {
  return (import.meta.env["VITE_KIDE_API_BASE_URL"] ?? "").replace(/\/$/, "");
}

export function synthesisEndpoint(path: string): string {
  const base = apiBase();
  return base ? `${base}${path}` : path;
}

export function synthesisEventsEndpoint(jobId: string): string {
  return synthesisEndpoint(`/api/v1/synthesis/${encodeURIComponent(jobId)}/events`);
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`KIDE API ${response.status}: ${message || response.statusText}`);
  }
  return (await response.json()) as T;
}

export async function startRemoteSynthesis(
  request: RemoteSynthesisRequest,
  signal?: AbortSignal,
): Promise<RemoteSynthesisJob> {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    ...(signal ? { signal } : {}),
  };
  const response = await fetch(synthesisEndpoint("/api/v1/synthesis"), init);
  return parseJson<RemoteSynthesisJob>(response);
}

export async function getRemoteSynthesis(
  jobId: string,
  signal?: AbortSignal,
): Promise<RemoteSynthesisJob> {
  const init: RequestInit = signal ? { signal } : {};
  const response = await fetch(
    synthesisEndpoint(`/api/v1/synthesis/${encodeURIComponent(jobId)}`),
    init,
  );
  return parseJson<RemoteSynthesisJob>(response);
}

function isTerminal(job: RemoteSynthesisJob): boolean {
  return job.status === "completed" || job.status === "failed";
}

function parseEvent(data: string): RemoteSynthesisJob {
  const parsed = JSON.parse(data) as unknown;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("jobId" in parsed) ||
    !("status" in parsed) ||
    typeof parsed.jobId !== "string" ||
    typeof parsed.status !== "string"
  ) {
    throw new Error("KIDE synthesis stream returned an invalid event.");
  }
  return parsed as RemoteSynthesisJob;
}

export function watchRemoteSynthesis(
  jobId: string, handlers: RemoteSynthesisHandlers
): () => void {
  let closed = false;
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let polling = false;

  const close = () => {
    closed = true;
    source?.close();
    source = null;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const schedulePoll = () => {
    if (closed || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void poll();
    }, POLL_INTERVAL_MS);
  };

  const poll = async () => {
    if (closed) return;
    try {
      const job = await getRemoteSynthesis(jobId);
      if (closed) return;
      handlers.onUpdate(job);
      if (isTerminal(job)) {
        close();
        return;
      }
      schedulePoll();
    } catch (error) {
      if (closed) return;
      handlers.onError?.(
        error instanceof Error ? error : new Error("Remote synthesis polling failed."),
      );
      schedulePoll();
    }
  };

  const fallBackToPolling = () => {
    if (closed || polling) return;
    polling = true;
    source?.close();
    source = null;
    void poll();
  };

  if (typeof EventSource === "undefined") {
    fallBackToPolling();
    return close;
  }

  source = new EventSource(synthesisEventsEndpoint(jobId), {
    withCredentials: true,
  });
  source.onmessage = (event) => {
    if (closed) return;
    try {
      const job = parseEvent(event.data);
      handlers.onUpdate(job);
      if (isTerminal(job)) close();
    } catch (error) {
      handlers.onError?.(
        error instanceof Error ? error : new Error("Invalid synthesis progress event."),
      );
      fallBackToPolling();
    }
  };
  source.onerror = () => {
    fallBackToPolling();
  };

  return close;
}

export function remoteSynthesisConfigured(): boolean {
  return Boolean(apiBase());
}

export interface RemoteActivity {
  name: string;
  capabilityUri: string;
}

export interface RemoteSynthesisRequest {
  projectId: string;
  activities: RemoteActivity[];
}

export interface RemoteSynthesisJob {
  jobId: string;
  status: string;
  progress?: unknown;
  result?: unknown;
  error?: string;
}

function apiBase(): string {
  return (import.meta.env["VITE_KIDE_API_BASE_URL"] ?? "").replace(/\/$/, "");
}

export function synthesisEndpoint(path: string): string {
  const base = apiBase();
  return base ? `${base}${path}` : path;
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

export function remoteSynthesisConfigured(): boolean {
  return Boolean(apiBase());
}

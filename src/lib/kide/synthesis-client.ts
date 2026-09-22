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

const API_BASE = (import.meta.env.VITE_KIDE_API_BASE_URL ?? "").replace(/\/$/, "");

function endpoint(path: string) {
  return API_BASE ? `${API_BASE}${path}` : path;
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
  const response = await fetch(endpoint("/api/v1/synthesis"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  return parseJson<RemoteSynthesisJob>(response);
}

export async function getRemoteSynthesis(
  jobId: string,
  signal?: AbortSignal,
): Promise<RemoteSynthesisJob> {
  const response = await fetch(endpoint(`/api/v1/synthesis/${encodeURIComponent(jobId)}`), {
    signal,
  });
  return parseJson<RemoteSynthesisJob>(response);
}

export function remoteSynthesisConfigured(): boolean {
  return Boolean(API_BASE);
}

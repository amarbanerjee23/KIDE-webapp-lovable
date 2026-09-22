import { useSyncExternalStore } from "react";
import type {
  RemoteSynthesisJob,
  RemoteSynthesisProgress,
  RemoteSynthesisResult,
} from "./synthesis-client";

export type RemoteSynthesisStatus =
  "idle" | "queued" | "pending" | "started" | "progress" | "completed" | "failed";

export interface RemoteSynthesisState {
  status: RemoteSynthesisStatus;
  jobId: string | null;
  progress: RemoteSynthesisProgress | null;
  result: RemoteSynthesisResult | null;
  error: string | null;
}

const initialState: RemoteSynthesisState = {
  status: "idle",
  jobId: null,
  progress: null,
  result: null,
  error: null,
};

let state = initialState;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function resetRemoteSynthesisState() {
  state = initialState;
  emit();
}

export function setRemoteSynthesisJob(job: RemoteSynthesisJob) {
  const status =
    job.status === "completed" ||
    job.status === "failed" ||
    job.status === "progress" ||
    job.status === "queued" ||
    job.status === "pending" ||
    job.status === "started"
      ? job.status
      : "pending";

  state = {
    status,
    jobId: job.jobId,
    progress: job.progress ?? state.progress,
    result: job.result ?? null,
    error: job.error ?? null,
  };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): RemoteSynthesisState {
  return state;
}

export function useRemoteSynthesisState(): RemoteSynthesisState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

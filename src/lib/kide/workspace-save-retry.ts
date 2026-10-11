import { useSyncExternalStore } from "react";

let version = 0;
const listeners = new Set<() => void>();

/** Retry saving the in-memory sources without reloading the server's snapshot. */
export function requestWorkspaceSaveRetry(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): number {
  return version;
}

export function useWorkspaceSaveRetryVersion(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

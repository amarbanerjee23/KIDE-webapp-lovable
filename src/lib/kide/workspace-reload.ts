import { useSyncExternalStore } from "react";

let version = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function requestWorkspaceReload() {
  version += 1;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return version;
}

export function useWorkspaceReloadVersion() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

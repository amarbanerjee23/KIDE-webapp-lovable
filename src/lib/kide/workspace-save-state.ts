import { useSyncExternalStore } from "react";

export type WorkspaceSaveStatus =
  | "idle"
  | "loading"
  | "load-error"
  | "saving"
  | "saved"
  | "read-only"
  | "offline"
  | "conflict"
  | "error";

/** Only a failed initial load may hide the model editor. */
export function isWorkspaceLoadFailure(status: WorkspaceSaveStatus): boolean {
  return status === "load-error";
}

/** Save retry must not reload or discard locally modified models. */
export function isManualSaveRetryAvailable(status: WorkspaceSaveStatus): boolean {
  return status === "error";
}

export interface WorkspaceSaveState {
  projectId: string | null;
  status: WorkspaceSaveStatus;
  savedAt: string | null;
  message: string | null;
}

const IDLE_STATE: WorkspaceSaveState = {
  projectId: null,
  status: "idle",
  savedAt: null,
  message: null,
};

let state: WorkspaceSaveState = IDLE_STATE;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setWorkspaceSaveState(next: WorkspaceSaveState) {
  state = next;
  emit();
}

export function clearWorkspaceSaveState() {
  state = IDLE_STATE;
  emit();
}

export function getWorkspaceSaveState(): WorkspaceSaveState {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWorkspaceSaveState(): WorkspaceSaveState {
  return useSyncExternalStore(subscribe, getWorkspaceSaveState, getWorkspaceSaveState);
}

import { useSyncExternalStore } from "react";

export type WorkspaceAccessStatus = "idle" | "loading" | "ready";

export interface WorkspaceAccessState {
  projectId: string | null;
  status: WorkspaceAccessStatus;
  canEdit: boolean;
}

const IDLE_STATE: WorkspaceAccessState = {
  projectId: null,
  status: "idle",
  canEdit: false,
};

let state: WorkspaceAccessState = IDLE_STATE;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getWorkspaceAccess(): WorkspaceAccessState {
  return state;
}

export function setWorkspaceAccessLoading(projectId: string) {
  state = {
    projectId,
    status: "loading",
    canEdit: false,
  };
  emit();
}

export function setWorkspaceAccess(projectId: string, canEdit: boolean) {
  state = {
    projectId,
    status: "ready",
    canEdit,
  };
  emit();
}

export function clearWorkspaceAccess() {
  state = IDLE_STATE;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): WorkspaceAccessState {
  return state;
}

export function useWorkspaceAccess(): WorkspaceAccessState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

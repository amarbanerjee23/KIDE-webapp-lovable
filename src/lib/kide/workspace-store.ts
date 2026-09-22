import { useSyncExternalStore } from "react";
import {
  initialWorkspaceSources,
  linkSources,
  type WorkspaceSources,
} from "@/lib/kide/workspace-sources";

/**
 * The open set of model files, shared by the editors, synthesis review,
 * scenario runner, and server-side verification.
 */
let sources: WorkspaceSources = initialWorkspaceSources();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setSource(path: string, value: string) {
  sources = { ...sources, [path]: value };
  emit();
}

export function resetWorkspace() {
  sources = initialWorkspaceSources();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): WorkspaceSources {
  return sources;
}

export function useWorkspaceSources(): WorkspaceSources {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const linkFrom = linkSources;

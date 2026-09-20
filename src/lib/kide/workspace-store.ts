import { useSyncExternalStore } from "react";
import { linkWorkspace, SAMPLE_WORKSPACE, type Workspace } from "@/lib/dsl";

/**
 * The open set of model files, shared by the editors, the synthesis review
 * and the scenario runner so they always describe the same system.
 */
type Sources = Record<string, string>;

const initial = (): Sources =>
  Object.fromEntries(SAMPLE_WORKSPACE.map((file) => [file.path, file.source]));

let sources: Sources = initial();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setSource(path: string, value: string) {
  sources = { ...sources, [path]: value };
  emit();
}

export function resetWorkspace() {
  sources = initial();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Sources {
  return sources;
}

export function useWorkspaceSources(): Sources {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function linkFrom(current: Sources): Workspace {
  return linkWorkspace(
    SAMPLE_WORKSPACE.map((file) => ({
      path: file.path,
      kind: file.kind,
      source: current[file.path] ?? "",
    })),
  );
}

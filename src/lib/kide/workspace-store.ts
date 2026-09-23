import { useSyncExternalStore } from "react";
import type { DslKind } from "@/lib/dsl";
import {
  assertWorkspacePathAvailable,
  normalizeWorkspaceFilePath,
  starterSourceForKind,
} from "@/lib/kide/workspace-files";
import {
  emptyWorkspaceSources,
  exampleWorkspaceSources,
  linkSources,
  type WorkspaceSources,
} from "@/lib/kide/workspace-sources";

/**
 * The active project's open model files. Engineering computation reads only
 * this browser-resident source map; persistence is handled separately.
 */
let sources: WorkspaceSources = emptyWorkspaceSources();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setSource(path: string, value: string) {
  if (!(path in sources)) {
    throw new Error(`Model file '${path}' does not exist in the active workspace.`);
  }

  sources = { ...sources, [path]: value };
  emit();
}

export function createWorkspaceFile(pathInput: string, kind: DslKind): string {
  const path = normalizeWorkspaceFilePath(pathInput, kind);
  assertWorkspacePathAvailable(sources, path);

  sources = {
    ...sources,
    [path]: starterSourceForKind(kind, path),
  };
  emit();
  return path;
}

export function renameWorkspaceFile(
  currentPath: string,
  nextPathInput: string,
  kind: DslKind,
): string {
  if (!(currentPath in sources)) {
    throw new Error(`Model file '${currentPath}' does not exist in the active workspace.`);
  }

  const nextPath = normalizeWorkspaceFilePath(nextPathInput, kind);
  assertWorkspacePathAvailable(sources, nextPath, currentPath);

  if (nextPath === currentPath) return currentPath;

  const nextSources: WorkspaceSources = {};
  for (const [path, source] of Object.entries(sources)) {
    nextSources[path === currentPath ? nextPath : path] = source;
  }

  sources = nextSources;
  emit();
  return nextPath;
}

export function deleteWorkspaceFile(path: string): void {
  if (!(path in sources)) return;

  const nextSources = { ...sources };
  delete nextSources[path];
  sources = nextSources;
  emit();
}

export function replaceWorkspaceSources(nextSources: WorkspaceSources) {
  sources = { ...nextSources };
  emit();
}

export function clearWorkspace() {
  sources = emptyWorkspaceSources();
  emit();
}

export function loadExampleWorkspace() {
  sources = exampleWorkspaceSources();
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

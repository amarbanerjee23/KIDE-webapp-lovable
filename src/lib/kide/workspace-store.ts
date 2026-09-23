import { useSyncExternalStore } from "react";
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
  sources = { ...sources, [path]: value };
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

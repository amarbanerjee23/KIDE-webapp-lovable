import { useSyncExternalStore } from "react";

const STORAGE_KEY = "kide:active-project";

export interface ActiveProject {
  projectId: string;
  organizationId: string;
}

let activeProject: ActiveProject | null = null;
let hydrated = false;
const listeners = new Set<() => void>();
type ProjectSwitchGuard = (next: ActiveProject | null) => boolean;
let projectSwitchGuard: ProjectSwitchGuard | null = null;

/** Installed by the authenticated persistence coordinator; fail closed on pending edits. */
export function registerProjectSwitchGuard(guard: ProjectSwitchGuard): () => void {
  projectSwitchGuard = guard;
  return () => {
    if (projectSwitchGuard === guard) projectSwitchGuard = null;
  };
}

function isSameProject(left: ActiveProject | null, right: ActiveProject | null): boolean {
  return left?.projectId === right?.projectId &&
    left?.organizationId === right?.organizationId;
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return;

  try {
    const parsed = JSON.parse(stored) as Partial<ActiveProject>;
    if (typeof parsed.projectId === "string" && typeof parsed.organizationId === "string") {
      activeProject = {
        projectId: parsed.projectId,
        organizationId: parsed.organizationId,
      };
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

function emit() {
  for (const listener of listeners) listener();
}

export function getActiveProject(): ActiveProject | null {
  hydrate();
  return activeProject;
}

export function setActiveProject(
  project: ActiveProject | null,
  options?: { force?: boolean },
): boolean {
  hydrate();
  // Reloading a picker often reselects the same project. Emitting an identical
  // selection makes the persistence hook discard its in-flight autosave timer.
  if (isSameProject(activeProject, project)) return true;
  // The editor's active source map belongs to the previous project. It must
  // never be cleared while a debounced or in-flight write is outstanding.
  if (!options?.force && projectSwitchGuard && !projectSwitchGuard(project)) return false;
  activeProject = project;

  if (typeof window !== "undefined") {
    if (project) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  emit();
  return true;
}

/** Auth/session revocation must always remove unauthorized project selection. */
export function clearActiveProject() {
  setActiveProject(null, { force: true });
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    const previous = activeProject;
    hydrated = false;
    hydrate();
    if (
      !isSameProject(previous, activeProject) &&
      projectSwitchGuard &&
      !projectSwitchGuard(activeProject)
    ) {
      // Other tabs cannot replace this tab's dirty in-memory project.
      // Do not ping-pong storage writes between tabs.
      activeProject = previous;
      return;
    }
    emit();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

function getSnapshot(): ActiveProject | null {
  hydrate();
  return activeProject;
}

function getServerSnapshot(): ActiveProject | null {
  return null;
}

export function useActiveProject(): ActiveProject | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

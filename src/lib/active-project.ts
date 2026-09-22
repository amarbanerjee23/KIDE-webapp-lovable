import { useSyncExternalStore } from "react";

const STORAGE_KEY = "kide:active-project";

export interface ActiveProject {
  projectId: string;
  organizationId: string;
}

let activeProject: ActiveProject | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

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

export function setActiveProject(project: ActiveProject | null) {
  hydrate();
  activeProject = project;

  if (typeof window !== "undefined") {
    if (project) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  emit();
}

export function clearActiveProject() {
  setActiveProject(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    hydrated = false;
    hydrate();
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

import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  loadProjectWorkingCopy,
  saveProjectWorkingCopy,
} from "@/lib/project-working-copy.functions";
import { useActiveProject } from "@/lib/active-project";
import { WORKING_COPY_CONFLICT_MESSAGE } from "@/lib/project-working-copy";
import {
  clearWorkspaceAccess,
  setWorkspaceAccess,
  setWorkspaceAccessLoading,
} from "@/lib/kide/workspace-access";
import {
  clearWorkspace,
  replaceWorkspaceSources,
  useWorkspaceSources,
} from "@/lib/kide/workspace-store";

const AUTOSAVE_DELAY_MS = 750;

export function useWorkspacePersistence(enabled: boolean) {
  const activeProject = useActiveProject();
  const sources = useWorkspaceSources();
  const load = useServerFn(loadProjectWorkingCopy);
  const save = useServerFn(saveProjectWorkingCopy);
  const loadedProjectRef = useRef<string | null>(null);
  const canEditRef = useRef(false);
  const generationRef = useRef(0);
  const lastSavedSourcesRef = useRef<string | null>(null);
  const savedAtRef = useRef<string | null>(null);
  const conflictedRef = useRef(false);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    loadedProjectRef.current = null;
    canEditRef.current = false;
    lastSavedSourcesRef.current = null;
    savedAtRef.current = null;
    conflictedRef.current = false;
    clearWorkspaceAccess();

    if (!enabled) return;

    if (!activeProject) {
      clearWorkspace();
      return;
    }

    clearWorkspace();
    setWorkspaceAccessLoading(activeProject.projectId);

    void load({ data: { projectId: activeProject.projectId } })
      .then((workingCopy) => {
        if (generation !== generationRef.current) return;

        loadedProjectRef.current = activeProject.projectId;
        canEditRef.current = workingCopy.canEdit;
        savedAtRef.current = workingCopy.savedAt;
        setWorkspaceAccess(activeProject.projectId, workingCopy.canEdit);

        if (workingCopy.sources) {
          lastSavedSourcesRef.current = JSON.stringify(workingCopy.sources);
          replaceWorkspaceSources(workingCopy.sources);
        } else {
          lastSavedSourcesRef.current = JSON.stringify({});
          clearWorkspace();
        }
      })
      .catch((error) => {
        if (generation !== generationRef.current) return;
        clearWorkspaceAccess();
        console.warn(
          "[Workspace] Could not load project working copy:",
          error instanceof Error ? error.message : error,
        );
      });
  }, [activeProject, enabled, load]);

  useEffect(() => {
    if (
      !enabled ||
      !activeProject ||
      loadedProjectRef.current !== activeProject.projectId ||
      !canEditRef.current ||
      conflictedRef.current
    ) {
      return;
    }

    const serialized = JSON.stringify(sources);
    if (serialized === lastSavedSourcesRef.current) return;

    const timer = window.setTimeout(() => {
      void save({
        data: {
          projectId: activeProject.projectId,
          sources,
          expectedSavedAt: savedAtRef.current,
        },
      })
        .then((result) => {
          savedAtRef.current = result.savedAt;
          lastSavedSourcesRef.current = serialized;
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);

          if (message.includes(WORKING_COPY_CONFLICT_MESSAGE)) {
            conflictedRef.current = true;
            toast.error("Project changed in another browser session", {
              description:
                "Your local edits are preserved. Reload this project before saving again.",
            });
            return;
          }

          console.warn("[Workspace] Autosave failed:", message);
        });
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [activeProject, enabled, save, sources]);
}

import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { loadProjectWorkingCopy, saveProjectWorkingCopy } from "@/lib/projects.functions";
import { useActiveProject } from "@/lib/active-project";
import {
  replaceWorkspaceSources,
  resetWorkspace,
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

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    loadedProjectRef.current = null;
    canEditRef.current = false;

    if (!enabled) return;

    if (!activeProject) {
      resetWorkspace();
      return;
    }

    void load({ data: { projectId: activeProject.projectId } })
      .then((workingCopy) => {
        if (generation !== generationRef.current) return;

        loadedProjectRef.current = activeProject.projectId;
        canEditRef.current = workingCopy.canEdit;

        if (workingCopy.sources) {
          replaceWorkspaceSources(workingCopy.sources);
        } else {
          resetWorkspace();
        }
      })
      .catch((error) => {
        if (generation !== generationRef.current) return;
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
      !canEditRef.current
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void save({
        data: {
          projectId: activeProject.projectId,
          sources,
        },
      }).catch((error) => {
        console.warn(
          "[Workspace] Autosave failed:",
          error instanceof Error ? error.message : error,
        );
      });
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [activeProject, enabled, save, sources]);
}

import { useEffect, useRef, useState } from "react";
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
import { clearWorkspaceSaveState, setWorkspaceSaveState } from "@/lib/kide/workspace-save-state";
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
  const saveErrorNotifiedRef = useRef(false);
  const [connectivityVersion, setConnectivityVersion] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const handleOffline = () => {
      if (!activeProject) return;
      setWorkspaceSaveState({
        projectId: activeProject.projectId,
        status: "offline",
        savedAt: savedAtRef.current,
        message: "Browser is offline. Unsaved changes will retry when connectivity returns.",
      });
    };

    const handleOnline = () => {
      saveErrorNotifiedRef.current = false;
      setConnectivityVersion((version) => version + 1);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    if (!window.navigator.onLine) handleOffline();

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [activeProject, enabled]);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    loadedProjectRef.current = null;
    canEditRef.current = false;
    lastSavedSourcesRef.current = null;
    savedAtRef.current = null;
    conflictedRef.current = false;
    saveErrorNotifiedRef.current = false;
    clearWorkspaceAccess();
    clearWorkspaceSaveState();

    if (!enabled) return;

    if (!activeProject) {
      clearWorkspace();
      return;
    }

    clearWorkspace();
    setWorkspaceAccessLoading(activeProject.projectId);
    setWorkspaceSaveState({
      projectId: activeProject.projectId,
      status: "loading",
      savedAt: null,
      message: null,
    });

    void load({ data: { projectId: activeProject.projectId } })
      .then((workingCopy) => {
        if (generation !== generationRef.current) return;

        loadedProjectRef.current = activeProject.projectId;
        canEditRef.current = workingCopy.canEdit;
        savedAtRef.current = workingCopy.savedAt;
        setWorkspaceAccess(activeProject.projectId, workingCopy.canEdit);
        setWorkspaceSaveState({
          projectId: activeProject.projectId,
          status: workingCopy.canEdit ? "saved" : "read-only",
          savedAt: workingCopy.savedAt,
          message: null,
        });

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
        const message =
          error instanceof Error ? error.message : "Could not load project workspace.";
        setWorkspaceSaveState({
          projectId: activeProject.projectId,
          status: "error",
          savedAt: null,
          message,
        });
        console.warn("[Workspace] Could not load project working copy:", message);
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

    if (typeof window !== "undefined" && !window.navigator.onLine) {
      setWorkspaceSaveState({
        projectId: activeProject.projectId,
        status: "offline",
        savedAt: savedAtRef.current,
        message: "Browser is offline. Unsaved changes will retry when connectivity returns.",
      });
      return;
    }

    setWorkspaceSaveState({
      projectId: activeProject.projectId,
      status: "saving",
      savedAt: savedAtRef.current,
      message: null,
    });

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
          saveErrorNotifiedRef.current = false;
          setWorkspaceSaveState({
            projectId: activeProject.projectId,
            status: "saved",
            savedAt: result.savedAt,
            message: null,
          });
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);

          if (message.includes(WORKING_COPY_CONFLICT_MESSAGE)) {
            conflictedRef.current = true;
            setWorkspaceSaveState({
              projectId: activeProject.projectId,
              status: "conflict",
              savedAt: savedAtRef.current,
              message: WORKING_COPY_CONFLICT_MESSAGE,
            });
            toast.error("Project changed in another browser session", {
              description:
                "Your local edits are preserved. Reload this project before saving again.",
            });
            return;
          }

          console.warn("[Workspace] Autosave failed:", message);
          setWorkspaceSaveState({
            projectId: activeProject.projectId,
            status: "error",
            savedAt: savedAtRef.current,
            message,
          });
          if (!saveErrorNotifiedRef.current) {
            saveErrorNotifiedRef.current = true;
            toast.error("Autosave failed", {
              description:
                "Your edits are still open in this browser, but KIDE could not save them to the active project. Check connectivity before leaving this page.",
            });
          }
        });
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [activeProject, connectivityVersion, enabled, save, sources]);
}

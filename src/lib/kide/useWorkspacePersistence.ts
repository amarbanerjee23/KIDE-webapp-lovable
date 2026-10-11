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
  autosaveDecision,
  hasQueuedAutosave,
  isCurrentAutosaveTicket,
} from "@/lib/kide/workspace-autosave";
import {
  clearWorkspaceAccess,
  setWorkspaceAccess,
  setWorkspaceAccessLoading,
} from "@/lib/kide/workspace-access";
import { clearWorkspaceSaveState, setWorkspaceSaveState } from "@/lib/kide/workspace-save-state";
import { requestWorkspaceReload, useWorkspaceReloadVersion } from "@/lib/kide/workspace-reload";
import { useWorkspaceSaveRetryVersion } from "@/lib/kide/workspace-save-retry";
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
  const inFlightSaveRef = useRef(false);
  const latestSourcesRef = useRef(sources);
  // Never compare a completed request against the stale render it originated from.
  latestSourcesRef.current = sources;
  const lastSavedSourcesRef = useRef<string | null>(null);
  const savedAtRef = useRef<string | null>(null);
  const conflictedRef = useRef(false);
  const saveErrorNotifiedRef = useRef(false);
  const [connectivityVersion, setConnectivityVersion] = useState(0);
  const workspaceReloadVersion = useWorkspaceReloadVersion();
  const workspaceSaveRetryVersion = useWorkspaceSaveRetryVersion();

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
      if (activeProject && loadedProjectRef.current !== activeProject.projectId) {
        requestWorkspaceReload();
      } else {
        setConnectivityVersion((version) => version + 1);
      }
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
    if (!enabled || typeof window === "undefined") return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (
        loadedProjectRef.current &&
        canEditRef.current &&
        JSON.stringify(latestSourcesRef.current) !== lastSavedSourcesRef.current
      ) {
        // Browser-native unsaved changes prompt on refresh/close. A deliberate
        // project switch is separate and still needs a dedicated save guard.
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [enabled]);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    loadedProjectRef.current = null;
    canEditRef.current = false;
    lastSavedSourcesRef.current = null;
    savedAtRef.current = null;
    conflictedRef.current = false;
    saveErrorNotifiedRef.current = false;
    // Old project requests may still resolve; generation guards discard them.
    // The next project's writes must never be held by an old in-flight request.
    inFlightSaveRef.current = false;
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
        const offline = typeof window !== "undefined" && !window.navigator.onLine;
        setWorkspaceSaveState({
          projectId: activeProject.projectId,
          status: offline ? "offline" : "load-error",
          savedAt: null,
          message: offline
            ? "Browser is offline. KIDE will retry workspace loading after connectivity returns."
            : message,
        });
        console.warn("[Workspace] Could not load project working copy:", message);
      });
  }, [activeProject, enabled, load, workspaceReloadVersion]);

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
    const decision = autosaveDecision(
      serialized,
      lastSavedSourcesRef.current,
      inFlightSaveRef.current,
    );
    if (decision === "clean") return;

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

    // A preceding request is still in flight. Do not send a second write with
    // the same expectedSavedAt: that would create an artificial save conflict.
    // Its completion schedules a fresh write of the latest editor snapshot.
    if (decision === "wait") return;

    const ticket = {
      projectId: activeProject.projectId,
      generation: generationRef.current,
    };
    const isCurrent = () =>
      isCurrentAutosaveTicket(ticket, generationRef.current, loadedProjectRef.current);

    const timer = window.setTimeout(() => {
      if (!isCurrent() || inFlightSaveRef.current) return;
      inFlightSaveRef.current = true;

      void save({
        data: {
          projectId: ticket.projectId,
          sources,
          expectedSavedAt: savedAtRef.current,
        },
      })
        .then((result) => {
          // Never let a save from an abandoned project/reload mutate the new
          // project's revision, Saved badge, or conflict/error notification.
          if (!isCurrent()) return;
          inFlightSaveRef.current = false;
          savedAtRef.current = result.savedAt;
          lastSavedSourcesRef.current = serialized;
          saveErrorNotifiedRef.current = false;

          if (hasQueuedAutosave(serialized, JSON.stringify(latestSourcesRef.current))) {
            setWorkspaceSaveState({
              projectId: ticket.projectId,
              status: "saving",
              savedAt: result.savedAt,
              message: null,
            });
            // The pending write committed. Re-run the debounce with its new
            // revision; never declare newer unsaved edits to be persisted.
            setConnectivityVersion((version) => version + 1);
            return;
          }

          setWorkspaceSaveState({
            projectId: ticket.projectId,
            status: "saved",
            savedAt: result.savedAt,
            message: null,
          });
        })
        .catch((error) => {
          if (!isCurrent()) return;
          inFlightSaveRef.current = false;
          const message = error instanceof Error ? error.message : String(error);

          if (message.includes(WORKING_COPY_CONFLICT_MESSAGE)) {
            conflictedRef.current = true;
            setWorkspaceSaveState({
              projectId: ticket.projectId,
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
          const offline = typeof window !== "undefined" && !window.navigator.onLine;
          setWorkspaceSaveState({
            projectId: ticket.projectId,
            status: offline ? "offline" : "error",
            savedAt: savedAtRef.current,
            message: offline
              ? "Browser is offline. Unsaved changes will retry when connectivity returns."
              : message,
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
  }, [activeProject, connectivityVersion, enabled, save, sources, workspaceSaveRetryVersion]);
}

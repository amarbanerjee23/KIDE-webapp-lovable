import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useActiveProject } from "@/lib/active-project";
import { useWorkspaceAccess } from "@/lib/kide/workspace-access";
import { requestWorkspaceReload } from "@/lib/kide/workspace-reload";
import { useWorkspaceSaveState } from "@/lib/kide/workspace-save-state";

export function EngineeringWorkspaceGuard({ children }: { children: ReactNode }) {
  const activeProject = useActiveProject();
  const workspaceAccess = useWorkspaceAccess();
  const saveState = useWorkspaceSaveState();

  if (!activeProject) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <h2 className="text-sm font-semibold">Choose a project first</h2>
        <p className="mx-auto mt-2 max-w-lg text-xs text-muted-foreground">
          This engineering view only uses the active project's saved workspace. KIDE will not
          substitute example or empty data when no project is selected.
        </p>
        <Button asChild className="mt-4" size="sm">
          <Link to="/projects">Choose project</Link>
        </Button>
      </section>
    );
  }

  const accessReady =
    workspaceAccess.status === "ready" && workspaceAccess.projectId === activeProject.projectId;

  if (accessReady) return <>{children}</>;

  const activeSaveState =
    saveState.projectId === activeProject.projectId ? saveState : null;

  if (activeSaveState?.status === "error") {
    return (
      <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
        <h2 className="text-sm font-semibold">Project workspace could not be loaded</h2>
        <p className="mx-auto mt-2 max-w-lg text-xs text-muted-foreground">
          {activeSaveState.message ??
            "KIDE could not load the saved working copy, so this view is not showing derived engineering results."}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={requestWorkspaceReload}>
            Retry loading
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/projects">Choose another project</Link>
          </Button>
        </div>
      </section>
    );
  }

  if (activeSaveState?.status === "offline") {
    return (
      <section className="rounded-lg border border-warning/40 bg-warning/5 p-6 text-center">
        <h2 className="text-sm font-semibold">Project workspace is unavailable offline</h2>
        <p className="mx-auto mt-2 max-w-lg text-xs text-muted-foreground">
          {activeSaveState.message ??
            "Reconnect to load this project. KIDE will retry automatically when connectivity returns."}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6 text-center">
      <h2 className="text-sm font-semibold">Loading project workspace…</h2>
      <p className="mx-auto mt-2 max-w-lg text-xs text-muted-foreground">
        KIDE is loading the saved working copy before calculating engineering results.
      </p>
    </section>
  );
}

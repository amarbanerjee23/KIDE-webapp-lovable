import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getActiveProject } from "@/lib/active-project";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, History, Save, Upload } from "lucide-react";
import { WorkspaceHeader } from "@/components/kide/WorkspaceHeader";
import { useProjectSelection } from "@/components/kide/useProjectSelection";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useWorkspaceAccess } from "@/lib/kide/workspace-access";
import { useWorkspaceSaveState } from "@/lib/kide/workspace-save-state";
import { createProject, listCheckpoints, saveCheckpoint } from "@/lib/projects.functions";
import { WORKING_COPY_LABEL } from "@/lib/project-working-copy";
import { linkFrom, replaceWorkspaceSources, useWorkspaceSources } from "@/lib/kide/workspace-store";
import { exportModelSet, importModelSet, type ImportOutcome } from "@/lib/kide/model-exchange";

const title = "Checkpoints & model exchange — KIDE";
const description =
  "Save a named checkpoint of every model, restore an earlier one, and move complete model sets between projects with verified checksums.";

export const Route = createFileRoute("/_authenticated/checkpoints")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckpointsPage,
});

type Checkpoint = Awaited<ReturnType<typeof listCheckpoints>>[number];

function CheckpointsPage() {
  const sources = useWorkspaceSources();
  const selection = useProjectSelection();
  const access = useWorkspaceAccess();
  const saveState = useWorkspaceSaveState();
  const save = useServerFn(saveCheckpoint);
  const list = useServerFn(listCheckpoints);
  const addProject = useServerFn(createProject);

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [label, setLabel] = useState("");
  const [projectName, setProjectName] = useState("");
  const [busy, setBusy] = useState(false);
  const checkpointsGeneration = useRef(0);
  const [pendingRestore, setPendingRestore] = useState<Checkpoint | null>(null);
  const [pendingImport, setPendingImport] = useState<ImportOutcome | null>(null);
  const canCreateProject =
    !selection.projectsLoading &&
    !selection.error &&
    ["owner", "administrator", "engineer"].includes(selection.myRole);
  const canEdit =
    !!selection.projectId &&
    !selection.projectsLoading &&
    !selection.error &&
    access.status === "ready" &&
    access.projectId === selection.projectId &&
    access.canEdit &&
    saveState.projectId === selection.projectId &&
    saveState.status === "saved";

  useEffect(() => {
    setPendingRestore(null);
    setPendingImport(null);
  }, [selection.projectId]);

  const counts = useMemo(() => {
    const workspace = linkFrom(sources);
    let errors = 0;
    let warnings = 0;
    for (const file of workspace.files)
      for (const diagnostic of file.diagnostics) {
        if (diagnostic.severity === "error") errors += 1;
        if (diagnostic.severity === "warning") warnings += 1;
      }
    return { errors, warnings };
  }, [sources]);

  const refresh = useCallback(
    async (projectId: string) => {
      const generation = ++checkpointsGeneration.current;
      const rows = await list({ data: { projectId } });
      if (generation === checkpointsGeneration.current) {
        setCheckpoints(rows.filter((checkpoint) => checkpoint.label !== WORKING_COPY_LABEL));
      }
    },
    [list],
  );

  useEffect(() => {
    checkpointsGeneration.current += 1;
    setCheckpoints([]);
    if (selection.projectId && !selection.projectsLoading) {
      void refresh(selection.projectId).catch(() =>
        toast.error("Could not load the selected project's checkpoints."),
      );
    }
    return () => {
      checkpointsGeneration.current += 1;
    };
  }, [selection.projectId, selection.projectsLoading, refresh]);

  const run = async (message: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const applyReplacement = () => {
    if (!canEdit) {
      toast.error("Wait for the active project to finish saving before replacing its models.");
      return;
    }
    if (pendingRestore) {
      replaceWorkspaceSources(pendingRestore.sources ?? {});
      toast.success(`Restored "${pendingRestore.label}".`);
    } else if (pendingImport) {
      replaceWorkspaceSources(pendingImport.sources);
      toast.success(`Imported ${pendingImport.fileCount} models.`);
    }
    setPendingRestore(null);
    setPendingImport(null);
  };

  const exportSet = () => {
    const doc = exportModelSet(sources);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "kide-model-set.json";
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${doc.files.length} models.`);
  };

  const importSet = async (file: File) => {
    const targetProjectId = selection.projectId;
    const outcome = importModelSet(await file.text());
    if (getActiveProject()?.projectId !== targetProjectId) {
      toast.error("The active project changed while reading the model set. Retry the import.");
      return;
    }
    if (!outcome.ok) {
      toast.error(outcome.problems[0] ?? "This model set could not be imported.");
      return;
    }
    if (!canEdit) {
      toast.error("This project is read-only or has unsaved changes.");
      return;
    }
    setPendingImport(outcome);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <WorkspaceHeader current="Checkpoints" />
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <header>
          <h1 className="text-lg font-semibold">Checkpoints and model exchange</h1>
          <p className="text-xs text-muted-foreground">
            The open models currently hold {counts.errors} errors and {counts.warnings} warnings.
          </p>
        </header>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Project</h2>
          {selection.orgs.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Create an organization on the Team page first.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                aria-label="Checkpoint organization"
                value={selection.orgId ?? ""}
                onChange={(event) => {
                  setProjectName("");
                  selection.setOrgId(event.target.value);
                }}
              >
                {selection.orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
              <select
                className="h-9 min-w-48 rounded-md border border-border bg-background px-2 text-xs"
                aria-label="Checkpoint project"
                disabled={selection.projectsLoading || Boolean(selection.error)}
                value={selection.projectId ?? ""}
                onChange={(event) => selection.setProjectId(event.target.value || null)}
              >
                {selection.projects.length === 0 ? (
                  <option value="">No projects yet</option>
                ) : (
                  <option value="">Choose project</option>
                )}
                {selection.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              {canCreateProject ? (
                <>
                  <input
                    className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                    aria-label="New checkpoint project name"
                    placeholder="New project name"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || !canCreateProject || !selection.orgId || !projectName.trim()}
                    onClick={() =>
                      void run("Project created.", async () => {
                        await addProject({
                          data: { organizationId: selection.orgId!, name: projectName },
                        });
                        setProjectName("");
                        await selection.refreshProjects(selection.orgId!);
                      })
                    }
                  >
                    Add project
                  </Button>
                </>
              ) : !selection.projectsLoading && selection.orgId && !selection.error ? (
                <p className="text-xs text-muted-foreground">
                  Only owners, administrators and engineers can create projects.
                </p>
              ) : null}
            </div>
          )}
          {selection.projectsLoading && (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              Loading selected organization projects…
            </p>
          )}
          {selection.error && (
            <div role="alert" className="mt-2 flex items-center gap-2 text-xs text-destructive">
              <span>{selection.error}</span>
              {selection.orgId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void selection.refreshProjects(selection.orgId!)}
                >
                  Retry
                </Button>
              )}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Save className="size-4" /> Save a checkpoint
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Stores every open model exactly as it is now, so you can come back to it later.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className="h-9 min-w-64 flex-1 rounded-md border border-border bg-background px-2 text-xs"
              aria-label="Checkpoint name"
              placeholder="What is this checkpoint? e.g. Before recharge rework"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <Button
              size="sm"
              disabled={busy || !canEdit}
              onClick={() =>
                void run("Checkpoint saved.", async () => {
                  await save({
                    data: {
                      projectId: selection.projectId!,
                      label: label.trim() === WORKING_COPY_LABEL ? "Checkpoint" : label,
                      sources,
                      errorCount: counts.errors,
                      warningCount: counts.warnings,
                    },
                  });
                  setLabel("");
                  await refresh(selection.projectId!);
                })
              }
            >
              Save checkpoint
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={exportSet}
              disabled={
                !selection.projectId ||
                !access.projectId ||
                access.projectId !== selection.projectId
              }
            >
              <Download className="size-4" /> Export model set
            </Button>
            <Button size="sm" variant="secondary" asChild disabled={!canEdit}>
              <label className="cursor-pointer">
                <Upload className="size-4" /> Import model set
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  aria-label="Choose model set JSON file"
                  disabled={!canEdit}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void importSet(file);
                  }}
                />
              </label>
            </Button>
          </div>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <History className="size-4" /> Saved checkpoints
          </h2>
          {checkpoints.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
              No checkpoints for this project yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {checkpoints.map((checkpoint) => (
                <li
                  key={checkpoint.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{checkpoint.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(checkpoint.created_at).toLocaleString()} ·{" "}
                      {Object.keys(checkpoint.sources ?? {}).length} models ·{" "}
                      {checkpoint.error_count} errors · {checkpoint.warning_count} warnings
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canEdit}
                    onClick={() => setPendingRestore(checkpoint)}
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <AlertDialog
          open={Boolean(pendingRestore || pendingImport)}
          onOpenChange={(open) => {
            if (!open) {
              setPendingRestore(null);
              setPendingImport(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Replace this project workspace?</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingRestore
                  ? `Restore "${pendingRestore.label}" exactly as saved?`
                  : `Import ${pendingImport?.fileCount ?? 0} verified model files?`}{" "}
                All current model files will be replaced, including any files not present in the
                selected set. This cannot be undone unless you have a previous checkpoint.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep current workspace</AlertDialogCancel>
              <AlertDialogAction disabled={!canEdit} onClick={applyReplacement}>
                Replace workspace
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  );
}

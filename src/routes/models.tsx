import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  FileCode2,
  Play,
  RotateCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { MonacoDslEditor } from "@/components/kide/MonacoDslEditor";
import { WorkspaceFileActions } from "@/components/kide/WorkspaceFileActions";
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
import {
  DEFAULT_EXAMPLE_WORKSPACE_ID,
  DSL_LANGUAGES,
  EXAMPLE_WORKSPACES,
  type Diagnostic,
  type WorkspaceFile,
} from "@/lib/dsl";
import { buildWorkspaceLanguageIndex } from "@/lib/dsl/workspace-language-service";
import { useActiveProject } from "@/lib/active-project";
import { useWorkspaceAccess } from "@/lib/kide/workspace-access";
import { useWorkspaceSaveState } from "@/lib/kide/workspace-save-state";
import {
  linkFrom,
  loadExampleWorkspace,
  setSource,
  useWorkspaceSources,
} from "@/lib/kide/workspace-store";

const title = "KIDE Model Languages — Data, Operations, MNC, Capabilities, Activities";
const description =
  "Edit all five KIDE modelling languages with completion, hover documentation and live cross-model checking.";

export const Route = createFileRoute("/models")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ModelLanguages,
});

function ModelLanguages() {
  const hash = useLocation({ select: (location) => location.hash });
  const activeProject = useActiveProject();
  const workspaceAccess = useWorkspaceAccess();
  const saveState = useWorkspaceSaveState();
  const sources = useWorkspaceSources();
  const requestedPath = decodeURIComponent(hash.replace(/^#/, ""));
  const workspace = useMemo(() => linkFrom(sources), [sources]);
  const languageIndex = useMemo(() => buildWorkspaceLanguageIndex(workspace), [workspace]);
  const editorFiles = useMemo<WorkspaceFile[]>(
    () =>
      workspace.files.map((file) => ({
        path: file.path,
        kind: file.kind,
        source: file.source,
      })),
    [workspace.files],
  );
  const initialPath = workspace.files.some((file) => file.path === requestedPath)
    ? requestedPath
    : (workspace.files[0]?.path ?? "");
  const [activePath, setActivePath] = useState(initialPath);
  const [selectedExampleId, setSelectedExampleId] = useState(DEFAULT_EXAMPLE_WORKSPACE_ID);
  const [confirmExampleLoad, setConfirmExampleLoad] = useState(false);
  const selectedExample =
    EXAMPLE_WORKSPACES.find((example) => example.id === selectedExampleId) ?? EXAMPLE_WORKSPACES[0];

  const applySelectedExample = () => {
    loadExampleWorkspace(selectedExampleId);
    setActivePath("");
    setConfirmExampleLoad(false);
  };

  const requestExampleLoad = () => {
    if (workspace.files.length === 0) {
      applySelectedExample();
      return;
    }
    setConfirmExampleLoad(true);
  };

  useEffect(() => {
    if (workspace.files.some((file) => file.path === activePath)) return;

    const nextPath = workspace.files.some((file) => file.path === requestedPath)
      ? requestedPath
      : (workspace.files[0]?.path ?? "");
    setActivePath(nextPath);
  }, [activePath, requestedPath, workspace.files]);

  const activeFile = workspace.files.find((file) => file.path === activePath);
  const language = DSL_LANGUAGES.find((entry) => entry.kind === activeFile?.kind);
  const accessReady =
    Boolean(activeProject) &&
    workspaceAccess.status === "ready" &&
    workspaceAccess.projectId === activeProject?.projectId;
  const canEdit = accessReady && workspaceAccess.canEdit;
  const activeSaveState =
    activeProject && saveState.projectId === activeProject.projectId ? saveState : null;
  const saveLabel =
    activeSaveState?.status === "saving"
      ? "Saving…"
      : activeSaveState?.status === "saved"
        ? "Saved"
        : activeSaveState?.status === "read-only"
          ? "Read-only"
          : activeSaveState?.status === "conflict"
            ? "Save conflict"
            : activeSaveState?.status === "error"
              ? "Save failed"
              : activeSaveState?.status === "loading"
                ? "Loading…"
                : null;

  const allProblems = workspace.files.flatMap((file) =>
    file.diagnostics.map((diagnostic) => ({ path: file.path, diagnostic })),
  );

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/projects">
            <ArrowLeft />
            Projects
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Model languages</h1>
          <p className="text-[10px] text-muted-foreground">
            {activeProject
              ? `${workspace.files.length} project model${workspace.files.length === 1 ? "" : "s"}`
              : "No active project"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <WorkspaceFileActions
            enabled={canEdit}
            activeFile={activeFile ? { path: activeFile.path, kind: activeFile.kind } : null}
            onActivePath={setActivePath}
          />
          {saveLabel ? (
            <span
              aria-live="polite"
              title={activeSaveState?.message ?? undefined}
              className={`rounded border px-2 py-1 text-[11px] ${
                activeSaveState?.status === "error" || activeSaveState?.status === "conflict"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : activeSaveState?.status === "saving"
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : "border-border bg-secondary text-muted-foreground"
              }`}
            >
              {saveLabel}
            </span>
          ) : null}
          <span
            className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] ${
              workspace.errorCount > 0
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-primary/30 bg-primary/10 text-primary"
            }`}
          >
            {workspace.errorCount > 0 ? (
              <CircleAlert className="size-3.5" />
            ) : (
              <Check className="size-3.5" />
            )}
            {workspace.errorCount > 0 ? `${workspace.errorCount} errors` : "All models consistent"}
          </span>
          <select
            value={selectedExampleId}
            onChange={(event) => setSelectedExampleId(event.target.value)}
            disabled={!canEdit}
            aria-label="Reference example workspace"
            className="h-8 max-w-64 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50"
          >
            {EXAMPLE_WORKSPACES.map((example) => (
              <option key={example.id} value={example.id}>
                {example.domain} — {example.title}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={requestExampleLoad} disabled={!canEdit}>
            <RotateCcw />
            Load selected
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/scenario">
              <Play />
              Run scenario
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/synthesis">
              <Sparkles />
              Synthesize
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="overflow-auto border-r border-border bg-sidebar p-3">
          <p className="mb-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase">
            Models
          </p>
          {workspace.files.map((file) => {
            const meta = DSL_LANGUAGES.find((entry) => entry.kind === file.kind);
            const fileErrors = file.diagnostics.filter((d) => d.severity === "error").length;
            const fileWarnings = file.diagnostics.filter((d) => d.severity === "warning").length;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => setActivePath(file.path)}
                className={`mb-1 w-full rounded-md border px-2.5 py-2 text-left transition-colors ${
                  file.path === activePath
                    ? "border-primary/40 bg-sidebar-accent"
                    : "border-transparent hover:border-border hover:bg-sidebar-accent/50"
                }`}
              >
                <span className="flex items-center gap-2 font-mono text-[11px]">
                  <FileCode2 className="size-3.5 text-capability" />
                  {file.path}
                </span>
                <span className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  {meta?.label}
                  {fileErrors > 0 && <span className="text-destructive">{fileErrors} errors</span>}
                  {fileErrors === 0 && fileWarnings > 0 && (
                    <span className="text-warning">{fileWarnings} warnings</span>
                  )}
                </span>
              </button>
            );
          })}
          <p className="mt-5 px-1 text-[10px] leading-relaxed text-muted-foreground">
            Press Ctrl+Space for workspace suggestions, F12 or Ctrl+Click for definition, Shift+F12
            for references, and hover for documentation. Names that do not exist anywhere in the
            workspace are reported below.
          </p>
          {selectedExample ? (
            <div className="mt-5 rounded-md border border-border bg-card/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Reference example
              </p>
              <p className="mt-1 text-xs font-semibold">{selectedExample.title}</p>
              <p className="mt-0.5 text-[10px] text-primary">{selectedExample.domain}</p>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                {selectedExample.summary}
              </p>
              <p className="mt-2 text-[10px] font-medium">Engineering challenge</p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                {selectedExample.engineeringChallenge}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {selectedExample.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded border border-border bg-background px-1.5 py-0.5 text-[9px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <section className="flex min-h-0 flex-col">
          <div className="border-b border-border bg-card/80 px-4 py-2">
            <p className="text-xs font-semibold">
              {language?.label} · <span className="font-mono">{activePath}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">{language?.description}</p>
          </div>

          <div className="min-h-0 flex-1">
            {!activeProject ? (
              <div className="grid h-full place-items-center p-8 text-center">
                <div className="max-w-md">
                  <p className="text-sm font-semibold">Select a project first</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    KIDE does not create or display demo engineering data until you explicitly ask
                    for an example workspace.
                  </p>
                  <Button asChild className="mt-4" size="sm">
                    <Link to="/projects">Choose project</Link>
                  </Button>
                </div>
              </div>
            ) : workspace.files.length === 0 ? (
              <div className="grid h-full place-items-center p-8 text-center">
                <div className="max-w-md">
                  <p className="text-sm font-semibold">This project has no model files yet</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {canEdit
                      ? "Use New model in the toolbar to create a DSL file, or load the example workspace only if you want reference starter content."
                      : "This project is empty. Your project role is read-only, so no model files can be created here."}
                  </p>
                  <Button
                    className="mt-4"
                    size="sm"
                    variant="outline"
                    onClick={requestExampleLoad}
                    disabled={!canEdit}
                  >
                    Load {selectedExample?.title ?? "selected example"}
                  </Button>
                </div>
              </div>
            ) : activeFile ? (
              <MonacoDslEditor
                path={activeFile.path}
                kind={activeFile.kind}
                value={sources[activeFile.path] ?? ""}
                diagnostics={activeFile.diagnostics}
                getSymbols={() => workspace.symbols}
                getLanguageIndex={() => languageIndex}
                workspaceFiles={editorFiles}
                onOpenPath={setActivePath}
                onChange={(next) => {
                  if (canEdit) setSource(activeFile.path, next);
                }}
                readOnly={!canEdit}
              />
            ) : null}
          </div>

          <div className="h-48 shrink-0 overflow-auto border-t border-border bg-card px-4 py-3">
            <div className="flex items-center gap-3 text-[11px]">
              <span className="font-semibold">Problems</span>
              <span className={workspace.errorCount ? "text-destructive" : "text-muted-foreground"}>
                {workspace.errorCount} errors
              </span>
              <span className={workspace.warningCount ? "text-warning" : "text-muted-foreground"}>
                {workspace.warningCount} warnings
              </span>
              <span className="ml-auto text-muted-foreground">
                Grammar check + cross-model resolution
              </span>
            </div>

            {allProblems.length === 0 ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-primary">
                <Check className="size-3.5" />
                Every model parses and every reference resolves.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {allProblems.map(({ path, diagnostic }, index) => (
                  <ProblemRow
                    key={`${path}-${index}`}
                    path={path}
                    diagnostic={diagnostic}
                    onSelect={() => setActivePath(path)}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <AlertDialog open={confirmExampleLoad} onOpenChange={setConfirmExampleLoad}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace this project workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              Loading {selectedExample?.title ?? "the selected example"} replaces every model file
              currently open in this project. KIDE autosaves workspace changes, so the replacement
              can be persisted to the active project. Use a checkpoint first if you may need the
              current model set later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current workspace</AlertDialogCancel>
            <AlertDialogAction onClick={applySelectedExample}>
              Replace with example
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function ProblemRow({
  path,
  diagnostic,
  onSelect,
}: {
  path: string;
  diagnostic: Diagnostic;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-start gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-secondary/50"
      >
        {diagnostic.severity === "error" ? (
          <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
        ) : (
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
        )}
        <span className="font-mono text-[10px] text-muted-foreground">
          {path}:{diagnostic.line}:{diagnostic.column}
        </span>
        <span className="min-w-0 flex-1">{diagnostic.message}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{diagnostic.code}</span>
      </button>
    </li>
  );
}

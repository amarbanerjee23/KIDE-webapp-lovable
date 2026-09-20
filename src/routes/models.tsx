import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft, Check, CircleAlert, FileCode2, Play, RotateCcw, Sparkles, TriangleAlert,
} from "lucide-react";
import { MonacoDslEditor } from "@/components/kide/MonacoDslEditor";
import { Button } from "@/components/ui/button";
import { DSL_LANGUAGES, SAMPLE_WORKSPACE, type Diagnostic } from "@/lib/dsl";
import { linkFrom, resetWorkspace, setSource, useWorkspaceSources } from "@/lib/kide/workspace-store";

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
  const sources = useWorkspaceSources();
  const requestedPath = decodeURIComponent(hash.replace(/^#/, ""));
  const initialPath = SAMPLE_WORKSPACE.some((file) => file.path === requestedPath)
    ? requestedPath
    : SAMPLE_WORKSPACE[0]?.path ?? "";
  const [activePath, setActivePath] = useState(initialPath);
  const workspace = useMemo(() => linkFrom(sources), [sources]);

  const activeFile = workspace.files.find((file) => file.path === activePath);
  const activeMeta = SAMPLE_WORKSPACE.find((file) => file.path === activePath);
  const language = DSL_LANGUAGES.find((entry) => entry.kind === activeMeta?.kind);

  const allProblems = workspace.files.flatMap((file) =>
    file.diagnostics.map((diagnostic) => ({ path: file.path, diagnostic })),
  );

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/projects"><ArrowLeft />Projects</Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Model languages</h1>
          <p className="text-[10px] text-muted-foreground">Warehouse Fleet · five linked models</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] ${
              workspace.errorCount > 0
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-primary/30 bg-primary/10 text-primary"
            }`}
          >
            {workspace.errorCount > 0 ? <CircleAlert className="size-3.5" /> : <Check className="size-3.5" />}
            {workspace.errorCount > 0 ? `${workspace.errorCount} errors` : "All models consistent"}
          </span>
          <Button variant="outline" size="sm" onClick={resetWorkspace}>
            <RotateCcw />Reset example
          </Button>
          <Button asChild variant="outline" size="sm"><Link to="/scenario"><Play />Run scenario</Link></Button>
          <Button asChild size="sm"><Link to="/synthesis"><Sparkles />Synthesize</Link></Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="overflow-auto border-r border-border bg-sidebar p-3">
          <p className="mb-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase">Models</p>
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
                  <FileCode2 className="size-3.5 text-capability" />{file.path}
                </span>
                <span className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  {meta?.label}
                  {fileErrors > 0 && <span className="text-destructive">{fileErrors} errors</span>}
                  {fileErrors === 0 && fileWarnings > 0 && <span className="text-warning">{fileWarnings} warnings</span>}
                </span>
              </button>
            );
          })}
          <p className="mt-5 px-1 text-[10px] leading-relaxed text-muted-foreground">
            Press Ctrl+Space for suggestions drawn from this workspace, hover any
            word for an explanation, and F1 for the command palette. Names that do
            not exist anywhere in the workspace are reported below.
          </p>
        </aside>

        <section className="flex min-h-0 flex-col">
          <div className="border-b border-border bg-card/80 px-4 py-2">
            <p className="text-xs font-semibold">{language?.label} · <span className="font-mono">{activePath}</span></p>
            <p className="text-[11px] text-muted-foreground">{language?.description}</p>
          </div>

          <div className="min-h-0 flex-1">
            {activeFile && activeMeta && (
              <MonacoDslEditor
                path={activeFile.path}
                kind={activeMeta.kind}
                value={sources[activeFile.path] ?? ""}
                diagnostics={activeFile.diagnostics}
                getSymbols={() => linkFrom(sources).symbols}
                onChange={(next) => setSource(activeFile.path, next)}
              />
            )}
          </div>

          <div className="h-48 shrink-0 overflow-auto border-t border-border bg-card px-4 py-3">
            <div className="flex items-center gap-3 text-[11px]">
              <span className="font-semibold">Problems</span>
              <span className={workspace.errorCount ? "text-destructive" : "text-muted-foreground"}>{workspace.errorCount} errors</span>
              <span className={workspace.warningCount ? "text-warning" : "text-muted-foreground"}>{workspace.warningCount} warnings</span>
              <span className="ml-auto text-muted-foreground">Grammar check + cross-model resolution</span>
            </div>

            {allProblems.length === 0 ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-primary">
                <Check className="size-3.5" />Every model parses and every reference resolves.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {allProblems.map(({ path, diagnostic }, index) => (
                  <ProblemRow key={`${path}-${index}`} path={path} diagnostic={diagnostic} onSelect={() => setActivePath(path)} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function ProblemRow({ path, diagnostic, onSelect }: { path: string; diagnostic: Diagnostic; onSelect: () => void }) {
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
        <span className="font-mono text-[10px] text-muted-foreground">{path}:{diagnostic.line}:{diagnostic.column}</span>
        <span className="min-w-0 flex-1">{diagnostic.message}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{diagnostic.code}</span>
      </button>
    </li>
  );
}

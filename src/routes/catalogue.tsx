import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, CircleAlert, Cpu, Network, Search, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveProject } from "@/lib/active-project";
import { buildCatalogue } from "@/lib/kide/catalogue";
import { linkFrom, useWorkspaceSources } from "@/lib/kide/workspace-store";
import {
  getKnowledgeGraphStatus,
  publishProjectKnowledgeGraph,
} from "@/lib/knowledge/knowledge.functions";
import { projectWorkspaceToKnowledgeGraph } from "@/lib/knowledge/project-graph";
import { summarizeKnowledgeGraph } from "@/lib/knowledge/summary";

const title = "Capability Catalogue — KIDE";
const description =
  "Browse project capabilities and inspect the thesis-aligned semantic graph that binds data, activity, capability and control models.";

export const Route = createFileRoute("/catalogue")({
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
  component: Catalogue,
});

function Chip({ label, tone }: { label: string; tone: string }) {
  return <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${tone}`}>{label}</span>;
}

function Catalogue() {
  const activeProject = useActiveProject();
  const sources = useWorkspaceSources();
  const workspace = useMemo(() => linkFrom(sources), [sources]);
  const catalogue = useMemo(() => buildCatalogue(workspace), [workspace]);
  const readGraphStatus = useServerFn(getKnowledgeGraphStatus);
  const publishGraph = useServerFn(publishProjectKnowledgeGraph);
  const [query, setQuery] = useState("");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [graphStatus, setGraphStatus] = useState<{
    configured: boolean;
    reachable: boolean;
  } | null>(null);
  const [publishState, setPublishState] = useState<"idle" | "publishing" | "published" | "error">(
    "idle",
  );

  const projection = useMemo(
    () =>
      activeProject ? projectWorkspaceToKnowledgeGraph(activeProject.projectId, workspace) : null,
    [activeProject, workspace],
  );
  const semanticSummary = useMemo(
    () => (projection ? summarizeKnowledgeGraph(projection) : null),
    [projection],
  );

  useEffect(() => {
    let active = true;
    void readGraphStatus()
      .then((status) => {
        if (active) setGraphStatus(status);
      })
      .catch(() => {
        if (active) setGraphStatus({ configured: false, reachable: false });
      });
    return () => {
      active = false;
    };
  }, [readGraphStatus]);

  const capabilities = catalogue.capabilities.filter((entry) => {
    if (eligibleOnly && !entry.eligible) return false;
    const haystack = [entry.name, entry.componentInterface, ...entry.commands]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  async function publishSemanticOverlay() {
    if (!projection || !graphStatus?.configured) return;
    setPublishState("publishing");
    try {
      await publishGraph({ data: projection });
      setPublishState("published");
    } catch {
      setPublishState("error");
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft />
            Workbench
          </Link>
        </Button>
        <div>
          <h1 className="text-sm font-semibold">Capability catalogue</h1>
          <p className="text-[10px] text-muted-foreground">
            {catalogue.eligibleCount} of {catalogue.capabilities.length} capabilities eligible ·{" "}
            {catalogue.devices.length} device interfaces
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find capabilities"
              className="h-8 w-56 rounded-md border border-input bg-background pl-8 pr-2 text-xs"
            />
          </label>
          <Button
            size="sm"
            variant={eligibleOnly ? "default" : "outline"}
            onClick={() => setEligibleOnly((value) => !value)}
          >
            Eligible only
          </Button>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-5 p-5 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-2">
          {capabilities.map((entry) => (
            <article
              key={entry.name}
              className={`rounded-lg border p-4 ${
                entry.eligible ? "border-border bg-card" : "border-destructive/40 bg-destructive/5"
              }`}
            >
              <header className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">{entry.name}</h2>
                <span className="text-[11px] text-muted-foreground">
                  on {entry.componentInterface ?? "no interface"}
                </span>
                <span
                  className={`ml-auto flex items-center gap-1 text-[11px] ${
                    entry.eligible ? "text-primary" : "text-destructive"
                  }`}
                >
                  {entry.eligible ? (
                    <Check className="size-3.5" />
                  ) : (
                    <CircleAlert className="size-3.5" />
                  )}
                  {entry.eligible ? "Eligible" : "Not eligible"}
                </span>
              </header>

              <div className="mt-2 flex flex-wrap gap-1">
                {entry.commands.map((name) => (
                  <Chip key={`c${name}`} label={`cmd ${name}`} tone="bg-primary/10 text-primary" />
                ))}
                {entry.events.map((name) => (
                  <Chip
                    key={`e${name}`}
                    label={`obs ${name}`}
                    tone="bg-muted text-muted-foreground"
                  />
                ))}
                {entry.dataPoints.map((name) => (
                  <Chip
                    key={`d${name}`}
                    label={`data ${name}`}
                    tone="bg-muted text-muted-foreground"
                  />
                ))}
                {entry.alarms.map((name) => (
                  <Chip
                    key={`a${name}`}
                    label={`alarm ${name}`}
                    tone="bg-destructive/10 text-destructive"
                  />
                ))}
              </div>

              {entry.outcomes.length > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Reports outcomes: <span className="font-mono">{entry.outcomes.join(", ")}</span>
                </p>
              )}

              <p className="mt-2 text-[11px] text-muted-foreground">
                {entry.usedBy.length > 0
                  ? `Used by ${entry.usedBy.join(", ")}.`
                  : "Not used by any workflow step yet."}
              </p>

              {!entry.eligible && (
                <ul className="mt-2 space-y-1">
                  {entry.reasons.map((reason) => (
                    <li key={reason} className="text-[11px] text-destructive">
                      Why rejected: {reason}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
          {capabilities.length === 0 && (
            <p className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
              No capability matches that search.
            </p>
          )}
        </section>

        <aside className="space-y-4">
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Cpu className="size-3.5" />
              Device interfaces
            </h2>
            {catalogue.devices.map((device) => (
              <div key={device.name} className="rounded-lg border border-border bg-card p-3">
                <p className="text-sm font-semibold">{device.name}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {device.commands.length} commands · {device.events.length} events ·{" "}
                  {device.alarms.length} alarms · {device.dataPoints.length} data points
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {device.backedCapabilities.length > 0
                    ? `Backs ${device.backedCapabilities.join(", ")}.`
                    : "No capability uses this interface."}
                </p>
              </div>
            ))}
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Network className="size-3.5" />
              Semantic project graph
            </h2>
            {!semanticSummary ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Select a project to build its semantic overlay.
              </p>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-border bg-background p-2">
                    <p className="font-semibold">{semanticSummary.nodeCount}</p>
                    <p className="text-[10px] text-muted-foreground">nodes</p>
                  </div>
                  <div className="rounded border border-border bg-background p-2">
                    <p className="font-semibold">{semanticSummary.edgeCount}</p>
                    <p className="text-[10px] text-muted-foreground">relationships</p>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {semanticSummary.byKind.Capability ?? 0} capabilities ·{" "}
                  {semanticSummary.byKind.Interface ?? 0} interfaces ·{" "}
                  {semanticSummary.byKind.Workflow ?? 0} workflows ·{" "}
                  {semanticSummary.byKind.DataModel ?? 0} data models
                </p>
                <p
                  className={`mt-2 text-[11px] ${
                    semanticSummary.errorCount > 0 ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {semanticSummary.errorCount} semantic errors · {semanticSummary.warningCount}{" "}
                  warnings
                </p>

                {projection?.diagnostics.slice(0, 4).map((diagnostic) => (
                  <p
                    key={`${diagnostic.code}:${diagnostic.entityId ?? diagnostic.message}`}
                    className="mt-1 text-[10px] text-muted-foreground"
                  >
                    {diagnostic.code}: {diagnostic.message}
                  </p>
                ))}

                <Button
                  className="mt-3 w-full"
                  size="sm"
                  variant="outline"
                  disabled={
                    !graphStatus?.configured ||
                    !graphStatus.reachable ||
                    publishState === "publishing" ||
                    semanticSummary.errorCount > 0
                  }
                  onClick={() => void publishSemanticOverlay()}
                >
                  <UploadCloud />
                  {publishState === "publishing"
                    ? "Publishing…"
                    : publishState === "published"
                      ? "Published"
                      : "Publish project graph"}
                </Button>

                <p className="mt-2 text-[10px] text-muted-foreground">
                  {!graphStatus?.configured
                    ? "JanusGraph is not configured for this deployment."
                    : graphStatus.reachable
                      ? "JanusGraph is reachable. Publishing replaces only this project's semantic overlay."
                      : "JanusGraph is configured but currently unreachable."}
                </p>
                {publishState === "error" && (
                  <p className="mt-1 text-[10px] text-destructive">
                    Project graph publication failed. The authored workspace remains unchanged.
                  </p>
                )}
              </>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

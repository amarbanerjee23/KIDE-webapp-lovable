import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CircleAlert,
  LayoutGrid,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseActivity } from "@/lib/dsl";
import { printActivityFile } from "@/lib/dsl/activity-printer";
import type { ActivityFileNode } from "@/lib/dsl/ast";
import { buildCatalogue } from "@/lib/kide/catalogue";
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  addActivity,
  autoLayout,
  buildGraph,
  connect,
  disconnect,
  removeActivity,
} from "@/lib/kide/activity-graph";
import { linkFrom, setSource, useWorkspaceSources } from "@/lib/kide/workspace-store";

const ACTIVITY_FILE = "MissionPlanning.activity";
const title = "Activity Designer — KIDE";
const description =
  "Lay out the workflow on a canvas: drag steps, draw normal and failure branches, drop in capabilities, and keep the activity source in sync.";

export const Route = createFileRoute("/designer")({
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
  component: Designer,
});

type Positions = Record<string, { x: number; y: number }>;

function Designer() {
  const sources = useWorkspaceSources();
  const source = sources[ACTIVITY_FILE] ?? "";
  const parsed = useMemo(() => parseActivity(source), [source]);
  const diagram = parsed.ast?.diagrams[0] ?? null;
  const catalogue = useMemo(() => buildCatalogue(linkFrom(sources)), [sources]);

  const [positions, setPositions] = useState<Positions>({});
  const [selectedRaw, setSelected] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const dragging = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const surface = useRef<HTMLDivElement | null>(null);

  const graphSource = useMemo(
    () => (diagram ? buildGraph(diagram, positions) : { nodes: [], edges: [], finals: [] }),
    [diagram, positions],
  );

  const graph = graphSource;
  const selected =
    selectedRaw && graph.nodes.some((node) => node.id === selectedRaw) ? selectedRaw : null;

  const commit = useCallback(
    (next: ActivityFileNode) => {
      setUndoStack((stack) => [...stack, source]);
      setRedoStack([]);
      setSource(ACTIVITY_FILE, printActivityFile(next));
    },
    [source],
  );

  const mutate = useCallback(
    (producer: (current: NonNullable<typeof diagram>) => NonNullable<typeof diagram>) => {
      if (!parsed.ast || !diagram) return;
      const next: ActivityFileNode = {
        ...parsed.ast,
        diagrams: parsed.ast.diagrams.map((item, index) => (index === 0 ? producer(diagram) : item)),
      };
      commit(next);
    },
    [commit, diagram, parsed.ast],
  );

  const undo = () => {
    const previous = undoStack[undoStack.length - 1];
    if (previous === undefined) return;
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, source]);
    setSource(ACTIVITY_FILE, previous);
  };

  const redo = () => {
    const nextSource = redoStack[redoStack.length - 1];
    if (nextSource === undefined) return;
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, source]);
    setSource(ACTIVITY_FILE, nextSource);
  };

  const onPointerDown = (event: React.PointerEvent, id: string, x: number, y: number) => {
    event.stopPropagation();
    setSelected(id);
    if (linking && linking !== id) {
      mutate((current) => connect(current, linking, id));
      setLinking(null);
      return;
    }
    const rect = surface.current?.getBoundingClientRect();
    if (!rect) return;
    dragging.current = {
      id,
      dx: (event.clientX - rect.left) / zoom - x,
      dy: (event.clientY - rect.top) / zoom - y,
    };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragging.current;
    const rect = surface.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const x = Math.max(0, Math.round(((event.clientX - rect.left) / zoom - drag.dx) / 10) * 10);
    const y = Math.max(0, Math.round(((event.clientY - rect.top) / zoom - drag.dy) / 10) * 10);
    setPositions((current) => ({ ...current, [drag.id]: { x, y } }));
  };

  const endDrag = () => {
    dragging.current = null;
  };

  const addFromCapability = (name: string) => {
    if (!diagram) return;
    let stepName = name;
    let suffix = 1;
    while (diagram.activities.some((activity) => activity.name === stepName)) {
      stepName = `${name}${++suffix}`;
    }
    const entry = catalogue.capabilities.find((item) => item.name === name);
    mutate((current) =>
      addActivity(current, stepName, {
        kind: "capability",
        ref: name,
        controls: entry?.commands.slice(0, 2) ?? [],
      }),
    );
    setSelected(stepName);
  };

  const width = Math.max(1200, ...graph.nodes.map((node) => node.x + NODE_WIDTH + 80));
  const height = Math.max(640, ...graph.nodes.map((node) => node.y + NODE_HEIGHT + 80));
  const errors = parsed.diagnostics.filter((item) => item.severity === "error");

  return (
    <main className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft />
            Workbench
          </Link>
        </Button>
        <div>
          <h1 className="text-sm font-semibold">Activity designer</h1>
          <p className="text-[10px] text-muted-foreground">
            {diagram?.name ?? "No diagram"} · {graph.nodes.length} steps · {graph.edges.length} branches
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={undo} disabled={undoStack.length === 0}>
            <Undo2 />
            Undo
          </Button>
          <Button variant="ghost" size="sm" onClick={redo} disabled={redoStack.length === 0}>
            <Redo2 />
            Redo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => diagram && setPositions(autoLayout(diagram))}
          >
            <LayoutGrid />
            Auto-layout
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>
            <ZoomOut />
          </Button>
          <span className="w-10 text-center text-[11px] tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}>
            <ZoomIn />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-auto border-r border-border bg-card/40 p-3">
          <div>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Capabilities
            </h2>
            <div className="space-y-1">
              {catalogue.capabilities.map((entry) => (
                <button
                  key={entry.name}
                  type="button"
                  onClick={() => addFromCapability(entry.name)}
                  disabled={!entry.eligible}
                  className="flex w-full items-start gap-2 rounded-md border border-border bg-background p-2 text-left text-xs hover:border-primary disabled:opacity-50"
                  title={entry.eligible ? "Add as a workflow step" : entry.reasons.join(" ")}
                >
                  <Plus className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="block font-medium">{entry.name}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {entry.componentInterface ?? "no device"} · {entry.commands.length} commands
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Problems
            </h2>
            {parsed.diagnostics.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No problems in this workflow.</p>
            ) : (
              <ul className="space-y-1">
                {parsed.diagnostics.map((item, index) => (
                  <li
                    key={`${item.code}-${index}`}
                    className={`flex gap-1.5 rounded border p-1.5 text-[10px] ${
                      item.severity === "error"
                        ? "border-destructive/40 text-destructive"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <CircleAlert className="mt-0.5 size-3 shrink-0" />
                    <span>
                      {item.message}
                      <span className="block opacity-70">
                        line {item.line}:{item.column}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className="relative min-w-0 flex-1 overflow-auto bg-[radial-gradient(circle,hsl(var(--border))_1px,transparent_1px)] [background-size:20px_20px]">
          <div
            ref={surface}
            className="relative origin-top-left"
            style={{ width, height, transform: `scale(${zoom})` }}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onClick={() => setLinking(null)}
          >
            <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L7,3 z" fill="currentColor" />
                </marker>
              </defs>
              {graph.edges.map((edge, edgeIndex) => {
                const parallel = graph.edges.filter(
                  (other) => other.from === edge.from && other.to === edge.to,
                );
                const rank = parallel.indexOf(edge) - (parallel.length - 1) / 2;
                const from = graph.nodes.find((node) => node.id === edge.from);
                const to = graph.nodes.find((node) => node.id === edge.to);
                if (!from || !to) return null;
                const x1 = from.x + NODE_WIDTH;
                const y1 = from.y + NODE_HEIGHT / 2;
                const x2 = to.x;
                const y2 = to.y + NODE_HEIGHT / 2;
                const bend = rank * 34;
                const mid = (x1 + x2) / 2;
                const color =
                  edge.kind === "failure"
                    ? "text-destructive"
                    : edge.kind === "conditional"
                      ? "text-amber-400"
                      : "text-muted-foreground";
                return (
                  <g key={`${edge.id}-${edgeIndex}`} className={color}>
                    <path
                      d={`M${x1},${y1} C${mid},${y1 + bend} ${mid},${y2 + bend} ${x2},${y2}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeDasharray={edge.kind === "failure" ? "5 4" : undefined}
                      markerEnd="url(#arrow)"
                    />
                    {edge.label ? (
                      <text
                        x={mid}
                        y={(y1 + y2) / 2 + bend - 6}
                        textAnchor="middle"
                        className="fill-current text-[10px]"
                      >
                        {edge.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>

            {graph.nodes.map((node) => (
              <div
                key={node.id}
                onPointerDown={(event) => onPointerDown(event, node.id, node.x, node.y)}
                style={{ left: node.x, top: node.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
                className={`absolute cursor-grab select-none rounded-md border bg-card p-2 shadow-sm ${
                  selected === node.id ? "border-primary ring-1 ring-primary" : "border-border"
                } ${linking === node.id ? "ring-2 ring-amber-400" : ""}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-xs font-semibold">{node.id}</span>
                  {node.duration ? (
                    <span className="font-mono text-[10px] text-muted-foreground">{node.duration}</span>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {node.description || node.performerKind}
                </p>
                <p className="mt-1 truncate font-mono text-[10px] text-primary">{node.performer}</p>
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setLinking(linking === node.id ? null : node.id);
                  }}
                  title="Draw a branch from this step"
                  className="absolute -right-2 top-1/2 size-4 -translate-y-1/2 rounded-full border border-border bg-background text-[9px] leading-none hover:border-primary"
                >
                  →
                </button>
              </div>
            ))}
          </div>
        </section>

        <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-auto border-l border-border bg-card/40 p-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {selected ? `Step: ${selected}` : "Select a step"}
          </h2>
          {selected ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLinking(selected)}
                className="justify-start"
              >
                Draw branch from here
              </Button>
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Outgoing branches</p>
                {graph.edges
                  .filter((edge) => edge.from === selected)
                  .map((edge) => (
                    <div
                      key={edge.id}
                      className="flex items-center justify-between rounded border border-border bg-background px-2 py-1 text-[11px]"
                    >
                      <span>
                        {edge.kind === "failure" ? "⚠ " : ""}
                        {edge.label || "always"} → {edge.to}
                      </span>
                      <button
                        type="button"
                        onClick={() => mutate((current) => disconnect(current, edge.id))}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove branch to ${edge.to}`}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                {graph.finals
                  .filter((final) => final.from === selected)
                  .map((final) => (
                    <div
                      key={final.id}
                      className="rounded border border-emerald-500/40 bg-background px-2 py-1 text-[11px] text-emerald-400"
                    >
                      finishes: {final.label}
                    </div>
                  ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="justify-start text-destructive"
                onClick={() => {
                  mutate((current) => removeActivity(current, selected));
                  setSelected(null);
                }}
              >
                <Trash2 />
                Delete step
              </Button>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Drag steps to arrange them, use the arrow handle to draw a branch, and add a capability
              from the left to create a new step. Dashed red branches are failure paths.
            </p>
          )}

          <div className="mt-auto space-y-1">
            <p className="text-[11px] text-muted-foreground">
              {errors.length === 0
                ? "Workflow source is valid."
                : `${errors.length} error(s) in the workflow source.`}
            </p>
            <Button asChild variant="ghost" size="sm" className="w-full justify-start">
              <Link to="/models">Open the source editor</Link>
            </Button>
          </div>
        </aside>
      </div>
    </main>
  );
}

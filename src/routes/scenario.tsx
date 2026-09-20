import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft, CircleAlert, FileCode2, Flag, Play, RotateCcw, SkipForward, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildScenario, resolveTransition, type ScenarioStep, type TraceEntry,
} from "@/lib/kide/scenario";
import { linkFrom, useWorkspaceSources } from "@/lib/kide/workspace-store";

const title = "Scenario Runner — KIDE";
const description =
  "Step a workflow event by event, choose the outcome each device reports, and watch the declared branch being taken.";

export const Route = createFileRoute("/scenario")({
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
  component: ScenarioRunner,
});

function ScenarioRunner() {
  const sources = useWorkspaceSources();
  const scenario = useMemo(() => buildScenario(linkFrom(sources)), [sources]);

  const [current, setCurrent] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [finished, setFinished] = useState<string | null>(null);

  const step: ScenarioStep | null =
    scenario.steps.find((entry) => entry.activity === current) ?? null;

  const reset = () => {
    setCurrent(null);
    setTrace([]);
    setFinished(null);
  };

  const start = () => {
    if (!scenario.startActivity) return;
    setCurrent(scenario.startActivity);
    setFinished(null);
    setTrace([
      {
        index: 0,
        activity: scenario.startActivity,
        detail: `Workflow '${scenario.diagram}' started at '${scenario.startActivity}'.`,
        outcome: null,
        kind: "start",
      },
    ]);
  };

  const advance = (outcome: string | null) => {
    if (!step) return;
    const transition = resolveTransition(step, outcome);
    const entries: TraceEntry[] = [];
    let index = trace.length;

    if (step.commands.length > 0) {
      entries.push({
        index: index++,
        activity: step.activity,
        detail: `Issued ${step.commands.join(", ")} through ${step.capability ?? "the bound performer"}.`,
        outcome: null,
        kind: "command",
      });
    }

    entries.push({
      index: index++,
      activity: step.activity,
      detail: transition.explanation,
      outcome,
      kind: transition.finalResult ? "final" : transition.nextActivity ? "outcome" : "blocked",
    });

    setTrace((prev) => [...prev, ...entries]);

    if (transition.finalResult) {
      setFinished(transition.finalResult);
      setCurrent(null);
    } else if (transition.nextActivity) {
      setCurrent(transition.nextActivity);
    } else {
      setFinished("stopped");
      setCurrent(null);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <Button asChild variant="ghost" size="sm"><Link to="/"><ArrowLeft />Workbench</Link></Button>
        <div>
          <h1 className="text-sm font-semibold">Scenario runner</h1>
          <p className="text-[10px] text-muted-foreground">
            {scenario.diagram ?? "No workflow"} · {scenario.steps.length} steps
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/models"><FileCode2 />Edit models</Link></Button>
          <Button variant="outline" size="sm" onClick={reset}><RotateCcw />Reset</Button>
          <Button size="sm" onClick={start} disabled={!scenario.startActivity}><Play />Start run</Button>
        </div>
      </header>

      {scenario.problems.length > 0 && (
        <ul className="border-b border-destructive/40 bg-destructive/10 px-5 py-2 text-xs text-destructive">
          {scenario.problems.map((problem) => (
            <li key={problem} className="flex items-center gap-2"><CircleAlert className="size-3.5" />{problem}</li>
          ))}
        </ul>
      )}

      <div className="mx-auto grid w-full max-w-7xl gap-4 p-5 lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,360px)]">
        <section className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-[10px] font-semibold text-muted-foreground uppercase">Workflow steps</p>
          {scenario.steps.map((entry) => {
            const visited = trace.some((item) => item.activity === entry.activity);
            const active = entry.activity === current;
            return (
              <div
                key={entry.activity}
                className={`mb-1.5 rounded-md border px-2.5 py-2 ${
                  active
                    ? "border-primary bg-primary/10"
                    : visited
                      ? "border-border bg-secondary/40"
                      : "border-transparent"
                }`}
              >
                <p className="text-xs font-medium">{entry.activity}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {entry.capability ?? entry.operation ?? "unassigned"}
                  {entry.duration ? ` · ${entry.duration}` : ""}
                </p>
              </div>
            );
          })}
          {scenario.results.length > 0 && (
            <p className="mt-3 text-[10px] text-muted-foreground">
              Declared results: {scenario.results.join(", ")}
            </p>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          {!current && !finished && (
            <p className="text-sm text-muted-foreground">
              Press <span className="font-medium text-foreground">Start run</span> to execute the
              workflow one event at a time. At each step you choose which outcome the device
              reports, and the runner follows the branch the workflow declares.
            </p>
          )}

          {finished && (
            <div className="rounded-md border border-primary/40 bg-primary/10 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Flag className="size-4" />
                {finished === "stopped" ? "Run stopped" : `Run finished with result '${finished}'`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {trace.length} events recorded. Reset to run again with different outcomes.
              </p>
            </div>
          )}

          {step && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase">Current step</p>
              <h2 className="text-lg font-semibold">{step.activity}</h2>
              {step.description && <p className="text-xs text-muted-foreground">{step.description}</p>}

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border/70 bg-background p-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Performed by</p>
                  <p className="font-mono text-xs text-capability">{step.capability ?? step.operation ?? "unassigned"}</p>
                </div>
                <div className="rounded-md border border-border/70 bg-background p-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Commands issued</p>
                  <p className="font-mono text-xs">{step.commands.join(", ") || "none"}</p>
                </div>
              </div>

              <p className="mt-4 text-xs font-medium">What does the device report?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {step.possibleOutcomes.map((outcome) => (
                  <Button key={outcome} variant="outline" size="sm" onClick={() => advance(outcome)}>
                    <Zap />{outcome}
                  </Button>
                ))}
                <Button variant="secondary" size="sm" onClick={() => advance(null)}>
                  <SkipForward />Completes normally
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-[10px] font-semibold text-muted-foreground uppercase">Execution trace</p>
          {trace.length === 0 ? (
            <p className="text-xs text-muted-foreground">No events yet.</p>
          ) : (
            <ol className="space-y-2">
              {trace.map((entry) => (
                <li key={`${entry.index}-${entry.activity}`} className="rounded-md border border-border/70 bg-background p-2.5">
                  <p className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                    #{entry.index + 1} · {entry.activity} · {entry.kind}
                  </p>
                  <p className="text-[11px]">{entry.detail}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}

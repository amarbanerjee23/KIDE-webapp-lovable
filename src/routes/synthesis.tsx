import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Copy,
  FileCode2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EngineeringWorkspaceGuard } from "@/components/kide/EngineeringWorkspaceGuard";
import {
  approvalFingerprint,
  approveCandidate,
  selectCandidate,
  useApprovalState,
} from "@/lib/kide/approval-store";
import { synthesize, type Candidate } from "@/lib/kide/synthesis";
import {
  evaluateGraphAssistance,
  graphAssistanceEnabled,
} from "@/lib/kide/graph-synthesis-assistance";
import {
  graphSynthesisInputsEnabled,
  promoteGraphSynthesisInputs,
} from "@/lib/kide/graph-synthesis-promotion";
import { getTrustedGlobalKnowledgeSnapshot } from "@/lib/knowledge/knowledge.functions";
import type { GlobalKnowledgeSnapshot } from "@/lib/knowledge/contracts";
import { linkFrom, useWorkspaceSources } from "@/lib/kide/workspace-store";

const title = "Synthesis Review — KIDE";
const description =
  "Deterministic control synthesis with preflight checks, ranked candidate designs and a full evidence ledger.";

export const Route = createFileRoute("/synthesis")({
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
  component: SynthesisReview,
});

function SynthesisReview() {
  const sources = useWorkspaceSources();
  const workspace = useMemo(() => linkFrom(sources), [sources]);
  const report = useMemo(() => synthesize(workspace), [workspace]);
  const graphEnabled = graphAssistanceEnabled(
    import.meta.env["VITE_KIDE_GRAPH_ASSISTED_SYNTHESIS"],
  );
  const graphInputsEnabled = graphSynthesisInputsEnabled(
    import.meta.env["VITE_KIDE_GRAPH_SYNTHESIS_INPUTS"],
  );
  const [graphSnapshot, setGraphSnapshot] = useState<GlobalKnowledgeSnapshot | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);

  useEffect(() => {
    if (!graphEnabled && !graphInputsEnabled) {
      setGraphSnapshot(null);
      setGraphError(null);
      return;
    }

    let active = true;
    setGraphError(null);
    void getTrustedGlobalKnowledgeSnapshot()
      .then((snapshot) => {
        if (active) setGraphSnapshot(snapshot);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setGraphSnapshot(null);
        setGraphError(
          error instanceof Error ? error.message : "Trusted graph knowledge is unavailable.",
        );
      });

    return () => {
      active = false;
    };
  }, [graphEnabled, graphInputsEnabled]);

  const graphAssistance = useMemo(
    () =>
      evaluateGraphAssistance(
        workspace,
        report,
        graphSnapshot,
        graphEnabled,
        graphError ?? undefined,
      ),
    [workspace, report, graphSnapshot, graphEnabled, graphError],
  );
  const graphPromotion = useMemo(
    () =>
      promoteGraphSynthesisInputs(
        workspace,
        report,
        graphSnapshot,
        graphInputsEnabled,
        graphError ?? undefined,
      ),
    [workspace, report, graphSnapshot, graphInputsEnabled, graphError],
  );

  const { selectedId: storedId } = useApprovalState();
  const [localId, setLocalId] = useState<string | null>(null);
  const selectedId = localId ?? storedId;
  const setSelectedId = (id: string | null) => {
    setLocalId(id);
    selectCandidate(id);
  };

  const selected: Candidate | null =
    report.candidates.find((candidate) => candidate.id === selectedId) ??
    report.candidates[0] ??
    null;

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft />
            Workbench
          </Link>
        </Button>
        <div>
          <h1 className="text-sm font-semibold">Synthesis review</h1>
          <p className="text-[10px] text-muted-foreground">
            {report.diagram ? `Workflow ${report.diagram}` : "No workflow"} · {report.generator}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 max-sm:ml-0 max-sm:w-full">
          <Button asChild variant="outline" size="sm">
            <Link to="/models">
              <FileCode2 />
              Edit models
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/trust">
              <ShieldCheck />
              Trust centre
            </Link>
          </Button>
          <Button
            size="sm"
            disabled={!report.ready || !selected || selected.validation.errors > 0}
            onClick={() => {
              if (!selected) return;
              approveCandidate({
                candidateId: selected.id,
                candidateName: selected.name,
                fingerprint:
                  graphPromotion.applied && graphPromotion.evidence
                    ? approvalFingerprint(selected.generatedMnc, graphPromotion.evidence)
                    : selected.generatedMnc,
                approvedAt: new Date().toISOString(),
                ...(graphPromotion.applied && graphPromotion.evidence
                  ? { graphSynthesisInputs: graphPromotion.evidence }
                  : {}),
                ...(graphAssistance.status === "active" && graphAssistance.shadow
                  ? {
                      graphAssistance: {
                        graphSnapshotFingerprint: graphAssistance.shadow.graphSnapshotFingerprint,
                        baselineSynthesisFingerprint:
                          graphAssistance.shadow.baselineSynthesisFingerprint,
                        sourceFingerprints: [
                          ...new Set(
                            graphAssistance.recommendations.flatMap((entry) =>
                              entry.devices.map((device) => device.sourceFingerprint),
                            ),
                          ),
                        ].sort(),
                      },
                    }
                  : {}),
              });
              toast.success(`${selected.name} design approved`, {
                description: "Recorded with its evidence ledger and generator version.",
              });
            }}
          >
            <ShieldCheck />
            Approve design
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl p-5">
        <EngineeringWorkspaceGuard>
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" />
              Preflight
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Synthesis only runs when the models are complete and consistent. Nothing is guessed.
            </p>
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {report.preflight.map((check) => (
                <li
                  key={check.id}
                  className="flex items-start gap-2 rounded-md border border-border/70 bg-background p-2.5"
                >
                  {check.status === "pass" ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  ) : check.status === "warn" ? (
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                  ) : (
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                  )}
                  <div>
                    <p className="text-xs font-medium">{check.label}</p>
                    <p className="text-[11px] text-muted-foreground">{check.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {graphEnabled && (
            <section className="mt-5 rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">Graph-assisted device recommendations</h2>
                <span className="rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                  {graphAssistance.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{graphAssistance.reason}</p>
              {graphAssistance.shadow && (
                <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                  graph {graphAssistance.shadow.graphSnapshotFingerprint.slice(0, 16)}… · baseline{" "}
                  {graphAssistance.shadow.baselineSynthesisFingerprint.slice(0, 16)}…
                </p>
              )}
              {graphAssistance.status === "active" && (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {graphAssistance.recommendations.map((entry) => (
                    <div
                      key={entry.requiredCapability}
                      className="rounded-md border border-border/70 bg-background p-3"
                    >
                      <p className="text-xs font-medium">{entry.requiredCapability}</p>
                      <ul className="mt-1.5 space-y-1">
                        {entry.devices.map((device) => (
                          <li
                            key={`${device.semanticId}:${device.capabilityId}`}
                            className="text-[11px] text-muted-foreground"
                          >
                            <span className="font-medium text-foreground">{device.label}</span> ·
                            confidence {device.confidence.toFixed(2)} · source{" "}
                            <span className="font-mono">
                              {device.sourceFingerprint.slice(0, 12)}…
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {graphInputsEnabled && (
            <section className="mt-5 rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">Promoted graph synthesis inputs</h2>
                <span className="rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                  {graphPromotion.applied ? "active" : "fallback"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{graphPromotion.reason}</p>
              {graphPromotion.evidence && (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {graphPromotion.evidence.bindings.map((binding) => (
                    <div
                      key={binding.requiredCapability}
                      className="rounded-md border border-border/70 bg-background p-3"
                    >
                      <p className="text-xs font-medium">{binding.requiredCapability}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {binding.deviceLabel} · confidence {binding.confidence.toFixed(2)}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {binding.deviceSemanticId}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {!report.ready ? (
            <p className="mt-5 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
              Synthesis is blocked. {report.blockedReason}
            </p>
          ) : (
            <>
              <section
                className="mt-5 grid gap-3 lg:grid-cols-3"
                role="radiogroup"
                aria-label="Synthesis candidates"
              >
                {report.candidates.map((candidate) => {
                  const active = candidate.id === selected?.id;
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSelectedId(candidate.id)}
                      className={`min-h-11 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        active
                          ? "border-primary bg-card"
                          : "border-border bg-card/60 hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{candidate.name}</p>
                        <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                          {candidate.scores.total}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{candidate.strategy}</p>
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        {candidate.summary}
                      </p>
                      <dl className="mt-3 space-y-1.5">
                        <Bar label="Coverage" value={candidate.scores.coverage} />
                        <Bar label="Observability" value={candidate.scores.observability} />
                        <Bar label="Resilience" value={candidate.scores.resilience} />
                        <Bar label="Simplicity" value={candidate.scores.simplicity} />
                      </dl>
                      <p className="mt-3 flex items-center gap-1.5 text-[11px]">
                        {candidate.validation.errors === 0 ? (
                          <>
                            <Check className="size-3.5 text-primary" />
                            Independently re-checked, no errors
                          </>
                        ) : (
                          <>
                            <CircleAlert className="size-3.5 text-destructive" />
                            {candidate.validation.errors} validation errors
                          </>
                        )}
                      </p>
                    </button>
                  );
                })}
              </section>

              {selected && (
                <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="rounded-lg border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold">Why this design?</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Each step, the performer chosen for it, and where the commands come from.
                    </p>
                    <ul className="mt-3 space-y-2">
                      {selected.bindings.map((binding) => (
                        <li
                          key={binding.activity}
                          className="rounded-md border border-border/70 bg-background p-3"
                        >
                          <p className="text-xs font-medium">{binding.activity}</p>
                          {binding.description && (
                            <p className="text-[11px] text-muted-foreground">
                              {binding.description}
                            </p>
                          )}
                          <p className="mt-1.5 font-mono text-[11px] text-capability">
                            {binding.capability ?? binding.operation ?? "unassigned"}
                            {binding.componentInterface ? ` → ${binding.componentInterface}` : ""}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {binding.commands.map((command) => (
                              <span
                                key={command}
                                className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px]"
                              >
                                cmd {command}
                              </span>
                            ))}
                            {binding.observations.map((item) => (
                              <span
                                key={item}
                                className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary"
                              >
                                obs {item}
                              </span>
                            ))}
                            {binding.alarms.map((item) => (
                              <span
                                key={item}
                                className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] text-destructive"
                              >
                                alarm {item}
                              </span>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>

                    <h3 className="mt-5 text-sm font-semibold">Evidence ledger</h3>
                    <ul className="mt-2 space-y-2">
                      {selected.evidence.map((entry) => (
                        <li
                          key={entry.rule}
                          className="rounded-md border border-border/70 bg-background p-3"
                        >
                          <p className="font-mono text-[10px] text-muted-foreground">
                            {entry.rule}
                          </p>
                          <p className="text-[11px]">{entry.statement}</p>
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                            {entry.elements.join(" · ")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">Generated control model</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        onClick={() => {
                          void navigator.clipboard.writeText(selected.generatedMnc);
                          toast.success("Control model copied");
                        }}
                      >
                        <Copy />
                        Copy
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selected.controlNodes.length} control nodes · re-parsed by the language
                      validator, independently of the generator.
                    </p>
                    <pre className="mt-3 max-h-[520px] overflow-auto rounded-md border border-border/70 bg-[#0E1117] p-3 font-mono text-[11px] leading-relaxed">
                      {selected.generatedMnc}
                    </pre>
                    {selected.validation.messages.length > 0 && (
                      <ul className="mt-3 space-y-1 text-[11px] text-destructive">
                        {selected.validation.messages.map((message, index) => (
                          <li key={index}>{message}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </EngineeringWorkspaceGuard>
      </div>
    </main>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="w-24 shrink-0 text-[10px] text-muted-foreground">{label}</dt>
      <dd className="flex-1">
        <div className="h-1.5 w-full rounded-full bg-secondary">
          <div className="h-1.5 rounded-full bg-primary" style={{ width: `${value}%` }} />
        </div>
      </dd>
      <span className="w-8 text-right font-mono text-[10px] text-muted-foreground">{value}</span>
    </div>
  );
}

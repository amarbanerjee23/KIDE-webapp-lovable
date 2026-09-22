import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { RemoteSynthesisPanel } from "@/components/kide/RemoteSynthesisPanel";
import { Button } from "@/components/ui/button";
import {
  approveCandidate,
  selectCandidate,
  useApprovalState,
} from "@/lib/kide/approval-store";
import { useRemoteSynthesisState } from "@/lib/kide/remote-synthesis-store";
import { synthesize, type Candidate } from "@/lib/kide/synthesis";
import { remoteSynthesisConfigured } from "@/lib/kide/synthesis-client";
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
  const report = useMemo(() => synthesize(linkFrom(sources)), [sources]);
  const remote = useRemoteSynthesisState();
  const enterpriseVerificationRequired = remoteSynthesisConfigured();
  const enterpriseVerified =
    !enterpriseVerificationRequired || remote.status === "completed";
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
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft />
            Workbench
          </Link>
        </Button>
        <div>
          <h1 className="text-sm font-semibold">Synthesis review</h1>
          <p className="text-[10px] text-muted-foreground">
            {report.diagram ? `Workflow ${report.diagram}` : "No workflow"} ·{" "}
            {report.generator}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
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
            disabled={
              !report.ready || !selected || selected.validation.errors > 0 || !enterpriseVerified
            }
            onClick={() => {
              if (!selected) return;
              approveCandidate({
                candidateId: selected.id,
                candidateName: selected.name,
                fingerprint: selected.generatedMnc,
                approvedAt: new Date().toISOString(),
              });
              toast.success(`${selected.name} design approved`, {
                description:
                  "Recorded with its evidence ledger and generator version.",
              });
            }}
          >
            <ShieldCheck />
            Approve design
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl p-5">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" />
            Preflight
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Synthesis only runs when the models are complete and consistent.
            Nothing is guessed.
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
                  <p className="text-[11px] text-muted-foreground">
                    {check.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <RemoteSynthesisPanel localReady={report.ready} />

        {!report.ready ? (
          <p className="mt-5 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
            Synthesis is blocked. {report.blockedReason}
          </p>
        ) : (
          <>
            <section className="mt-5 grid gap-3 lg:grid-cols-3">
              {report.candidates.map((candidate) => {
                const active = candidate.id === selected?.id;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setSelectedId(candidate.id)}
                    className={`rounded-lg border p-4 text-left transition-colors ${
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
                    <p className="text-[10px] text-muted-foreground">
                      {candidate.strategy}
                    </p>
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      {candidate.summary}
                    </p>
                    <dl className="mt-3 space-y-1.5">
                      <Bar label="Coverage" value={candidate.scores.coverage} />
                      <Bar
                        label="Observability"
                        value={candidate.scores.observability}
                      />
                      <Bar
                        label="Resilience"
                        value={candidate.scores.resilience}
                      />
                      <Bar
                        label="Simplicity"
                        value={candidate.scores.simplicity}
                      />
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
                    Each step, the performer chosen for it, and where the
                    commands come from.
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
                          {binding.capability ??
                            binding.operation ??
                            "unassigned"}
                          {binding.componentInterface
                            ? ` → ${binding.componentInterface}`
                            : ""}
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

                  <h3 className="mt-5 text-sm font-semibold">
                    Evidence ledger
                  </h3>
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
                    <h3 className="text-sm font-semibold">
                      Generated control model
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          selected.generatedMnc,
                        );
                        toast.success("Control model copied");
                      }}
                    >
                      <Copy />
                      Copy
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selected.controlNodes.length} control nodes · re-parsed by
                    the language validator, independently of the generator.
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
      </div>
    </main>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="w-24 shrink-0 text-[10px] text-muted-foreground">
        {label}
      </dt>
      <dd className="flex-1">
        <div className="h-1.5 w-full rounded-full bg-secondary">
          <div
            className="h-1.5 rounded-full bg-primary"
            style={{ width: `${value}%` }}
          />
        </div>
      </dd>
      <span className="w-8 text-right font-mono text-[10px] text-muted-foreground">
        {value}
      </span>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { Check, CircleAlert, LoaderCircle, ServerCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  resetServerVerification,
  setServerVerificationCompleted,
  setServerVerificationFailed,
  setServerVerificationRunning,
  useServerVerificationState,
} from "@/lib/kide/server-verification-store";
import { verifySynthesisOnServer } from "@/lib/kide/standalone-synthesis.functions";
import { workspaceFilesFromSources } from "@/lib/kide/workspace-sources";
import { useWorkspaceSources } from "@/lib/kide/workspace-store";

export function ServerSynthesisPanel({ localReady }: { localReady: boolean }) {
  const sources = useWorkspaceSources();
  const state = useServerVerificationState();
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    resetServerVerification();
  }, [sources]);

  const run = async () => {
    if (!localReady || state.status === "running") return;

    const generation = generationRef.current;
    setServerVerificationRunning();

    try {
      const report = await verifySynthesisOnServer({
        data: { files: workspaceFilesFromSources(sources) },
      });
      if (generation !== generationRef.current) return;
      setServerVerificationCompleted(report);
    } catch (error) {
      if (generation !== generationRef.current) return;
      setServerVerificationFailed(
        error instanceof Error ? error.message : "Server synthesis verification failed.",
      );
    }
  };

  const validationErrors =
    state.report?.candidates.reduce((total, candidate) => total + candidate.validation.errors, 0) ??
    0;

  return (
    <section className="mt-5 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <ServerCog className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Node server verification</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The standalone TanStack server re-runs the same TypeScript parser, linker, and
            deterministic synthesis engine before a design can be approved.
          </p>
        </div>
        <Button
          size="sm"
          disabled={!localReady || state.status === "running"}
          onClick={() => void run()}
        >
          {state.status === "running" ? (
            <LoaderCircle className="animate-spin" />
          ) : state.status === "completed" ? (
            <Check />
          ) : (
            <ServerCog />
          )}
          {state.status === "completed" ? "Verify again" : "Verify on server"}
        </Button>
      </div>

      {state.status === "running" && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Re-parsing and synthesizing the workspace in the Node runtime…
        </p>
      )}

      {state.status === "completed" && state.report && (
        <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-3">
          <Metric label="Candidates" value={state.report.candidates.length} />
          <Metric
            label="Preflight passed"
            value={state.report.preflight.filter((check) => check.status === "pass").length}
          />
          <Metric label="Generated errors" value={validationErrors} />
        </div>
      )}

      {state.status === "failed" && state.error && (
        <p className="mt-3 flex items-center gap-2 text-[11px] text-destructive">
          <CircleAlert className="size-3.5" />
          {state.error}
        </p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/70 bg-background p-2.5">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold">{value}</p>
    </div>
  );
}

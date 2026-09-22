import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, CloudCog, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildRemoteSynthesisRequest } from "@/lib/kide/remote-synthesis";
import {
  remoteSynthesisConfigured,
  startRemoteSynthesis,
  watchRemoteSynthesis,
} from "@/lib/kide/synthesis-client";
import {
  resetRemoteSynthesisState,
  setRemoteSynthesisJob,
  useRemoteSynthesisState,
} from "@/lib/kide/remote-synthesis-store";
import {
  linkFrom,
  useWorkspaceSources,
} from "@/lib/kide/workspace-store";

export function RemoteSynthesisPanel({ localReady }: { localReady: boolean }) {
  const sources = useWorkspaceSources();
  const workspace = useMemo(() => linkFrom(sources), [sources]);
  const build = useMemo(
    () => buildRemoteSynthesisRequest(workspace),
    [workspace],
  );
  const state = useRemoteSynthesisState();
  const [launchError, setLaunchError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    stopRef.current?.();
    stopRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    resetRemoteSynthesisState();
    setLaunchError(null);
  }, [sources]);

  useEffect(
    () => () => {
      stopRef.current?.();
      abortRef.current?.abort();
    },
    [],
  );

  if (!remoteSynthesisConfigured()) return null;

  const running = ["queued", "pending", "started", "progress"].includes(
    state.status,
  );
  const percent = Math.max(
    0,
    Math.min(100, state.progress?.percent ?? (running ? 5 : 0)),
  );

  const run = async () => {
    if (!build.request || !localReady || running) return;

    stopRef.current?.();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLaunchError(null);

    try {
      const job = await startRemoteSynthesis(build.request, controller.signal);
      setRemoteSynthesisJob(job);
      stopRef.current = watchRemoteSynthesis(job.jobId, {
        onUpdate: setRemoteSynthesisJob,
        onError: (error) => setLaunchError(error.message),
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message =
        error instanceof Error
          ? error.message
          : "Unable to start enterprise synthesis.";
      setLaunchError(message);
      setRemoteSynthesisJob({
        jobId: "launch-failed",
        status: "failed",
        error: message,
      });
    }
  };

  return (
    <section className="mt-5 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <CloudCog className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Enterprise synthesis verification</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            COMPOSEMACHINES runs in the synthesis service. Device and session
            contracts are resolved against the semantic store; progress is
            streamed back to this review.
          </p>
        </div>
        <Button
          size="sm"
          disabled={!localReady || !build.request || running}
          onClick={() => void run()}
        >
          {running ? (
            <LoaderCircle className="animate-spin" />
          ) : state.status === "completed" ? (
            <Check />
          ) : (
            <CloudCog />
          )}
          {state.status === "completed" ? "Run again" : "Run enterprise synthesis"}
        </Button>
      </div>

      {build.issues.length > 0 && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3">
          <p className="flex items-center gap-2 text-xs font-medium text-destructive">
            <CircleAlert className="size-3.5" />
            Remote synthesis is blocked
          </p>
          <ul className="mt-1 list-disc pl-5 text-[11px] text-destructive">
            {build.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {running && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{state.progress?.stage ?? state.status}</span>
            <span className="font-mono">{percent}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {state.status === "completed" && state.result && (
        <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-4">
          <Metric label="Controllers" value={state.result.controllers.length} />
          <Metric
            label="Validated sessions"
            value={state.result.evidence.sessionTypesValidated}
          />
          <Metric
            label="Synthetic transitions"
            value={state.result.evidence.syntheticTransitions}
          />
          <Metric
            label="Cross-device edges"
            value={state.result.evidence.crossDeviceCoordinations}
          />
        </div>
      )}

      {(state.error || launchError) && (
        <p className="mt-3 text-[11px] text-destructive">
          {state.error ?? launchError}
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

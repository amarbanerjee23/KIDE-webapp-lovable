import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, CircleAlert, Download, Package, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EngineeringBackButton } from "@/components/kide/EngineeringBackButton";
import { EngineeringWorkspaceGuard } from "@/components/kide/EngineeringWorkspaceGuard";
import { buildAssurance } from "@/lib/kide/assurance";
import { buildRelease } from "@/lib/kide/release";
import { synthesize } from "@/lib/kide/synthesis";
import { linkFrom, useWorkspaceSources } from "@/lib/kide/workspace-store";
import { approvalIsCurrentForSynthesisContext, useApprovalState } from "@/lib/kide/approval-store";
import {
  graphSynthesisInputsEnabled,
  promoteGraphSynthesisInputs,
} from "@/lib/kide/graph-synthesis-promotion";
import {
  getGraphSynthesisProductionPolicy,
  getTrustedGlobalKnowledgeSnapshot,
} from "@/lib/knowledge/knowledge.functions";
import type { GraphSynthesisProductionPolicy } from "@/lib/knowledge/graph-synthesis-policy";
import type { GlobalKnowledgeSnapshot } from "@/lib/knowledge/contracts";

const title = "Release Centre — KIDE";
const description =
  "Package the models, the generated control design, the evidence ledger and the gate results into a checksummed, versioned release bundle.";

export const Route = createFileRoute("/release")({
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
  component: ReleaseCentre,
});

function ReleaseCentre() {
  const sources = useWorkspaceSources();
  const { selectedId, approval } = useApprovalState();
  const [version, setVersion] = useState("1.0.0");
  const graphInputsCapabilityEnabled = graphSynthesisInputsEnabled(
    import.meta.env["VITE_KIDE_GRAPH_SYNTHESIS_INPUTS"],
  );
  const [productionPolicy, setProductionPolicy] = useState<GraphSynthesisProductionPolicy | null>(
    null,
  );
  const [graphSnapshot, setGraphSnapshot] = useState<GlobalKnowledgeSnapshot | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    if (!graphInputsCapabilityEnabled) {
      setProductionPolicy(null);
      setGraphSnapshot(null);
      setRuntimeError(null);
      return;
    }

    let active = true;
    const refreshRuntime = () => {
      setRuntimeError(null);
      void getGraphSynthesisProductionPolicy()
        .then(async (policy) => {
          if (!active) return;
          setProductionPolicy(policy);
          if (!policy.enabled) {
            setGraphSnapshot(null);
            return;
          }
          const snapshot = await getTrustedGlobalKnowledgeSnapshot();
          if (active) setGraphSnapshot(snapshot);
        })
        .catch((error: unknown) => {
          if (!active) return;
          setProductionPolicy(null);
          setGraphSnapshot(null);
          setRuntimeError(
            error instanceof Error
              ? error.message
              : "Graph synthesis runtime state is unavailable.",
          );
        });
    };

    refreshRuntime();
    const timer = window.setInterval(refreshRuntime, 30_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [graphInputsCapabilityEnabled]);

  const { workspace, report, assurance } = useMemo(() => {
    const workspace = linkFrom(sources);
    const report = synthesize(workspace);
    return {
      workspace,
      report,
      assurance: buildAssurance(workspace, report, selectedId),
    };
  }, [sources, selectedId]);

  const graphPromotion = useMemo(
    () =>
      promoteGraphSynthesisInputs(
        workspace,
        report,
        graphSnapshot,
        graphInputsCapabilityEnabled && productionPolicy?.enabled === true,
        runtimeError ?? undefined,
      ),
    [
      workspace,
      report,
      graphSnapshot,
      graphInputsCapabilityEnabled,
      productionPolicy,
      runtimeError,
    ],
  );

  const currentGraphInputs =
    graphPromotion.applied && graphPromotion.evidence ? graphPromotion.evidence : null;
  const approvalCurrent = approvalIsCurrentForSynthesisContext(
    approval,
    assurance.candidate?.generatedMnc ?? null,
    currentGraphInputs,
  );

  const bundle = useMemo(
    () =>
      buildRelease(workspace, report, assurance, version, {
        graphSynthesisInputs: currentGraphInputs,
        approvalFingerprint: approval?.fingerprint ?? null,
        approvalCurrent,
      }),
    [workspace, report, assurance, version, currentGraphInputs, approval, approvalCurrent],
  );
  const canRelease = bundle.releasable;

  const download = () => {
    const payload = JSON.stringify(
      {
        manifest: JSON.parse(bundle.manifest),
        manifestSha256: bundle.manifestHash,
        approvedBy: approval,
        artifacts: bundle.artifacts,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `kide-release-${bundle.version}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Release bundle ${bundle.version} exported`, {
      description: `${bundle.artifacts.length} artefacts · manifest ${bundle.manifestHash.slice(0, 12)}…`,
    });
  };

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2">
        <EngineeringBackButton />
        <div>
          <h1 className="text-sm font-semibold">Release centre</h1>
          <p className="text-[10px] text-muted-foreground">
            {bundle.design ? `Design ${bundle.design}` : "No design selected"} · {bundle.generator}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 max-sm:ml-0 max-sm:w-full">
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            Version
            <input
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              className="h-8 w-24 rounded-md border border-input bg-background px-2 font-mono text-xs"
            />
          </label>
          <Button size="sm" disabled={!canRelease} onClick={download}>
            <Download />
            Export bundle
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl space-y-5 p-5">
        <EngineeringWorkspaceGuard>
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="size-4 text-primary" />
              Gates
            </h2>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {assurance.gates.map((gate) => (
                <div key={gate.id} className="rounded-md border border-border bg-background p-3">
                  <p className="flex items-center gap-2 text-xs font-medium">
                    {gate.status === "pass" ? (
                      <Check className="size-3.5 text-primary" />
                    ) : (
                      <CircleAlert className="size-3.5 text-destructive" />
                    )}
                    {gate.label}
                  </p>
                  <p className="mt-1 pl-5 text-[11px] text-muted-foreground">{gate.detail}</p>
                </div>
              ))}
              <div className="rounded-md border border-border bg-background p-3">
                <p className="flex items-center gap-2 text-xs font-medium">
                  {approvalCurrent ? (
                    <Check className="size-3.5 text-primary" />
                  ) : (
                    <CircleAlert className="size-3.5 text-destructive" />
                  )}
                  A reviewer approved this exact design
                </p>
                <p className="mt-1 pl-5 text-[11px] text-muted-foreground">
                  {approvalCurrent
                    ? `${approval?.candidateName} approved ${new Date(approval!.approvedAt).toLocaleString()}.`
                    : approval
                      ? "The models changed after approval, so the approval no longer applies. Review and approve again."
                      : "Approve a design in the synthesis review before releasing."}{" "}
                  <Link to="/synthesis" className="text-primary underline">
                    Open synthesis review
                  </Link>
                </p>
              </div>
            </div>
            {approval?.graphSynthesisInputs && (
              <div className="mt-3 rounded-md border border-border bg-background p-3 text-[11px]">
                <p className="font-medium">Graph synthesis runtime approval status</p>
                <p className="mt-1 text-muted-foreground">
                  {runtimeError ??
                    productionPolicy?.reason ??
                    "Checking runtime production policy and current graph snapshot…"}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {approvalCurrent ? "approval-current" : "approval-invalidated"}
                </p>
              </div>
            )}

            {!canRelease && (
              <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[11px] text-destructive">
                Release blocked. Resolve everything above — see the{" "}
                <Link to="/trust" className="underline">
                  Trust Centre
                </Link>{" "}
                for the repair steps.
              </p>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Package className="size-4 text-primary" />
              Bundle contents
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Manifest checksum{" "}
              <span className="break-all font-mono text-foreground">{bundle.manifestHash}</span>
            </p>
            <div className="mt-3 overflow-x-auto rounded-md border border-border/70">
              <table className="min-w-[640px] w-full text-left text-[11px]">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">Artefact</th>
                    <th className="p-2 font-medium">Kind</th>
                    <th className="p-2 font-medium">Size</th>
                    <th className="p-2 font-medium">SHA-256</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.artifacts.map((entry) => (
                    <tr key={entry.path} className="border-t border-border">
                      <td className="p-2 font-mono">{entry.path}</td>
                      <td className="p-2">{entry.kind}</td>
                      <td className="p-2">{entry.bytes} B</td>
                      <td className="p-2 font-mono text-muted-foreground">
                        {entry.sha256.slice(0, 16)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </EngineeringWorkspaceGuard>
      </div>
    </main>
  );
}

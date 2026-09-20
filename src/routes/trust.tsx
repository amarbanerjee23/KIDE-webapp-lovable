import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, CircleAlert, Rocket, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildAssurance, type Finding } from "@/lib/kide/assurance";
import { synthesize } from "@/lib/kide/synthesis";
import { linkFrom, useWorkspaceSources } from "@/lib/kide/workspace-store";
import { useApprovalState } from "@/lib/kide/approval-store";

const title = "Trust Centre — KIDE";
const description =
  "Every open finding, its impact on the system, how to repair it, and the full traceability matrix from workflow step to control node.";

export const Route = createFileRoute("/trust")({
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
  component: TrustCentre,
});

const severityStyle: Record<Finding["severity"], string> = {
  blocker: "border-destructive/40 bg-destructive/5",
  warning: "border-amber-500/40 bg-amber-500/5",
  info: "border-border bg-card",
};

function TrustCentre() {
  const sources = useWorkspaceSources();
  const { selectedId } = useApprovalState();
  const [area, setArea] = useState<"all" | Finding["area"]>("all");

  const assurance = useMemo(() => {
    const workspace = linkFrom(sources);
    return buildAssurance(workspace, synthesize(workspace), selectedId);
  }, [sources, selectedId]);

  const findings = assurance.findings.filter((finding) => area === "all" || finding.area === area);

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
          <h1 className="text-sm font-semibold">Trust Centre</h1>
          <p className="text-[10px] text-muted-foreground">
            {assurance.blockers} blockers · {assurance.warnings} warnings ·{" "}
            {assurance.tracedPercent}% traced
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`rounded-md px-2 py-1 text-xs font-medium ${
              assurance.releasable
                ? "bg-primary/10 text-primary"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {assurance.releasable ? "Ready for release" : "Release blocked"}
          </span>
          <Button asChild size="sm" variant="outline">
            <Link to="/release">
              <Rocket />
              Release centre
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl space-y-5 p-5">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" />
            Release gates
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Each gate is decided by a check over the models, not by a judgement call.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {assurance.gates.map((gate) => (
              <div
                key={gate.id}
                className={`rounded-md border p-3 ${
                  gate.status === "pass" ? "border-border bg-background" : severityStyle.blocker
                }`}
              >
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
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Findings</h2>
            <div className="ml-auto flex gap-1">
              {(["all", "models", "synthesis", "workflow", "coverage"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setArea(value)}
                  className={`rounded-md px-2 py-1 text-[11px] capitalize ${
                    area === value
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {findings.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-xs text-primary">
              <Check className="size-4" />
              Nothing open here. Every check in this area passes.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {findings.map((finding) => (
                <li
                  key={finding.id}
                  className={`rounded-md border p-3 ${severityStyle[finding.severity]}`}
                >
                  <p className="flex items-center gap-2 text-xs font-medium">
                    {finding.severity === "blocker" ? (
                      <CircleAlert className="size-3.5 text-destructive" />
                    ) : (
                      <TriangleAlert className="size-3.5 text-amber-500" />
                    )}
                    {finding.title}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">Impact: </span>
                    {finding.impact}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">Repair: </span>
                    {finding.repair}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {finding.rule}
                    {finding.location ? ` · ${finding.location}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Traceability matrix</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Workflow step → capability → device interface → issued commands → control node.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="p-2 font-medium">Step</th>
                  <th className="p-2 font-medium">Capability</th>
                  <th className="p-2 font-medium">Interface</th>
                  <th className="p-2 font-medium">Commands</th>
                  <th className="p-2 font-medium">Observations</th>
                  <th className="p-2 font-medium">Control node</th>
                  <th className="p-2 font-medium">Operation</th>
                  <th className="p-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {assurance.traceability.map((row) => (
                  <tr key={row.step} className="border-t border-border">
                    <td className="p-2 font-medium">{row.step}</td>
                    <td className="p-2 font-mono">{row.capability ?? "—"}</td>
                    <td className="p-2 font-mono">{row.componentInterface ?? "—"}</td>
                    <td className="p-2 font-mono">{row.commands.join(", ") || "—"}</td>
                    <td className="p-2 font-mono">{row.observations.join(", ") || "—"}</td>
                    <td className="p-2 font-mono">{row.controlNode ?? "—"}</td>
                    <td className="p-2 font-mono">{row.operation ?? "—"}</td>
                    <td className="p-2">
                      <span
                        className={
                          row.status === "traced"
                            ? "text-primary"
                            : row.status === "partial"
                              ? "text-amber-500"
                              : "text-destructive"
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {assurance.traceability.length === 0 && (
                  <tr>
                    <td className="p-2 text-muted-foreground" colSpan={8}>
                      No design has been produced yet, so there is nothing to trace.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Activity,
  Box,
  Check,
  CircleAlert,
  FileCode2,
  GitBranch,
  Library,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { WorkspaceHeader } from "@/components/kide/WorkspaceHeader";
import { useActiveProjectDetails } from "@/components/kide/useActiveProjectDetails";
import { Button } from "@/components/ui/button";
import { useApprovalState } from "@/lib/kide/approval-store";
import { buildAssurance } from "@/lib/kide/assurance";
import { buildCatalogue } from "@/lib/kide/catalogue";
import { synthesize } from "@/lib/kide/synthesis";
import { useWorkspaceAccess } from "@/lib/kide/workspace-access";
import { linkFrom, useWorkspaceSources } from "@/lib/kide/workspace-store";

const title = "Engineering workbench — KIDE";
const description =
  "Inspect the active project's linked models, capabilities, workflow readiness, synthesis state and assurance evidence.";

export const Route = createFileRoute("/workbench")({
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
  component: KideWorkbench,
});

function KideWorkbench() {
  const projectContext = useActiveProjectDetails();
  const workspaceAccess = useWorkspaceAccess();
  const sources = useWorkspaceSources();
  const workspace = useMemo(() => linkFrom(sources), [sources]);
  const catalogue = useMemo(() => buildCatalogue(workspace), [workspace]);
  const synthesis = useMemo(() => synthesize(workspace), [workspace]);
  const approval = useApprovalState();
  const assurance = useMemo(
    () => buildAssurance(workspace, synthesis, approval.selectedId),
    [workspace, synthesis, approval.selectedId],
  );

  const errors = workspace.files.reduce(
    (count, file) =>
      count + file.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
    0,
  );
  const warnings = workspace.files.reduce(
    (count, file) =>
      count + file.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
    0,
  );

  const workflowSummary = useMemo(() => {
    let diagrams = 0;
    let activities = 0;

    for (const file of workspace.files) {
      const ast = file.result.ast;
      if (ast?.node !== "ActivityFile") continue;
      diagrams += ast.diagrams.length;
      activities += ast.diagrams.reduce((count, diagram) => count + diagram.activities.length, 0);
    }

    return { diagrams, activities };
  }, [workspace.files]);

  const gatesPassed = assurance.gates.filter((gate) => gate.status === "pass").length;
  const hasProject = Boolean(projectContext.details);
  const workspaceReady =
    hasProject &&
    workspaceAccess.status === "ready" &&
    workspaceAccess.projectId === projectContext.details?.projectId;

  const flow = [
    {
      label: "Models",
      icon: FileCode2,
      to: "/models",
      value: `${workspace.files.length} files`,
      detail:
        workspace.files.length === 0
          ? "Create or import the first model."
          : errors === 0
            ? "All model files parse and link."
            : `${errors} blocking model error${errors === 1 ? "" : "s"}.`,
      state: workspace.files.length > 0 && errors === 0 ? "pass" : "attention",
    },
    {
      label: "Device knowledge",
      icon: Library,
      to: "/catalogue",
      value: `${catalogue.devices.length} interfaces`,
      detail:
        catalogue.devices.length > 0
          ? "Authored component interfaces available to capabilities."
          : "No device interface is authored yet.",
      state: catalogue.devices.length > 0 ? "pass" : "attention",
    },
    {
      label: "Capabilities",
      icon: Box,
      to: "/catalogue",
      value: `${catalogue.eligibleCount}/${catalogue.capabilities.length} usable`,
      detail:
        catalogue.capabilities.length > 0
          ? "Eligibility is computed from interface and command contracts."
          : "No capabilities are authored yet.",
      state: catalogue.eligibleCount > 0 ? "pass" : "attention",
    },
    {
      label: "Activities",
      icon: Activity,
      to: "/designer",
      value: `${workflowSummary.activities} activities`,
      detail:
        workflowSummary.diagrams > 0
          ? `${workflowSummary.diagrams} workflow${workflowSummary.diagrams === 1 ? "" : "s"} linked.`
          : "No activity workflow is authored yet.",
      state: workflowSummary.diagrams > 0 ? "pass" : "attention",
    },
    {
      label: "Synthesis",
      icon: GitBranch,
      to: "/synthesis",
      value: synthesis.ready ? `${synthesis.candidates.length} candidates` : "Blocked",
      detail: synthesis.ready
        ? "Preflight passed for the active workspace."
        : (synthesis.blockedReason ?? "Complete the model preflight first."),
      state: synthesis.ready ? "pass" : "attention",
    },
    {
      label: "Verification",
      icon: ShieldCheck,
      to: "/trust",
      value: `${assurance.blockers} blockers`,
      detail: `${assurance.tracedPercent}% of the current evidence is traced.`,
      state: assurance.blockers === 0 && workspace.files.length > 0 ? "pass" : "attention",
    },
    {
      label: "Release",
      icon: Upload,
      to: "/release",
      value: assurance.releasable ? "Ready" : `${gatesPassed}/${assurance.gates.length} gates`,
      detail: assurance.releasable
        ? "The active baseline is eligible for release."
        : "Release stays blocked until every required gate passes.",
      state: assurance.releasable ? "pass" : "attention",
    },
  ] as const;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <WorkspaceHeader current="Workbench" />

      <div className="mx-auto max-w-7xl px-5 py-7">
        {!projectContext.loading && !hasProject ? (
          <section className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <h1 className="text-lg font-semibold">Choose a project to open the workbench</h1>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              KIDE does not substitute demo engineering data when no project is active. Select a
              project to inspect its saved models, capabilities, workflows and assurance evidence.
            </p>
            <Button asChild className="mt-5">
              <Link to="/projects">Choose project</Link>
            </Button>
          </section>
        ) : (
          <>
            <section className="flex flex-wrap items-end gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                  Engineering workbench
                </p>
                <h1 className="mt-1 truncate text-2xl font-semibold">
                  {projectContext.loading
                    ? "Loading project…"
                    : (projectContext.details?.projectName ?? "Project unavailable")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {projectContext.details
                    ? `${projectContext.details.organizationName} · stage ${projectContext.details.currentStage} · ${projectContext.details.status.replace("_", " ")}`
                    : (projectContext.error ?? "The selected project is no longer available.")}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/models">Edit models</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/designer">Activity designer</Link>
                </Button>
                {synthesis.ready ? (
                  <Button asChild size="sm">
                    <Link to="/synthesis">
                      <Sparkles />
                      Synthesis
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" disabled title="Complete synthesis preflight first">
                    <Sparkles />
                    Synthesis
                  </Button>
                )}
              </div>
            </section>

            {workspaceAccess.status === "loading" ? (
              <div className="mt-5 rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                Loading the saved project workspace…
              </div>
            ) : null}

            {workspaceReady && !workspaceAccess.canEdit ? (
              <div className="mt-5 rounded-md border border-border bg-secondary/40 px-4 py-3 text-sm">
                This project is read-only for your current organization role. You can inspect models
                and evidence, but edits will not be saved.
              </div>
            ) : null}

            <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Model health"
                value={workspace.files.length === 0 ? "Empty" : errors === 0 ? "Valid" : "Blocked"}
                note={`${errors} errors · ${warnings} warnings`}
                tone={workspace.files.length > 0 && errors === 0 ? "good" : "warn"}
              />
              <Metric
                label="Capabilities"
                value={`${catalogue.eligibleCount}/${catalogue.capabilities.length}`}
                note="eligible / authored"
                tone={catalogue.eligibleCount > 0 ? "good" : "neutral"}
              />
              <Metric
                label="Workflow"
                value={`${workflowSummary.activities}`}
                note={`activities across ${workflowSummary.diagrams} workflow${workflowSummary.diagrams === 1 ? "" : "s"}`}
                tone={workflowSummary.activities > 0 ? "good" : "neutral"}
              />
              <Metric
                label="Assurance"
                value={`${gatesPassed}/${assurance.gates.length}`}
                note="release gates passed"
                tone={assurance.releasable ? "good" : "warn"}
              />
            </section>

            <section className="mt-8">
              <div>
                <h2 className="text-sm font-semibold">Engineering flow</h2>
                <p className="text-xs text-muted-foreground">
                  Every status below is computed from the active project's saved workspace.
                </p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {flow.map((item) => (
                  <FlowCard key={item.label} {...item} />
                ))}
              </div>
            </section>

            <section className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-lg border border-border bg-card">
                <header className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold">Project model files</h2>
                    <p className="text-[11px] text-muted-foreground">
                      Only files actually stored in this project's working copy are listed.
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="text-xs">
                    <Link to="/models">Open editor</Link>
                  </Button>
                </header>
                {workspace.files.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-sm font-medium">No model files yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Create a model or explicitly load a reference example from Model languages.
                    </p>
                    <Button asChild variant="outline" size="sm" className="mt-4">
                      <Link to="/models">Create first model</Link>
                    </Button>
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {workspace.files.map((file) => {
                      const fileErrors = file.diagnostics.filter(
                        (diagnostic) => diagnostic.severity === "error",
                      ).length;
                      const fileWarnings = file.diagnostics.filter(
                        (diagnostic) => diagnostic.severity === "warning",
                      ).length;
                      return (
                        <li key={file.path}>
                          <Link
                            to="/models"
                            hash={file.path}
                            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40"
                          >
                            <FileCode2 className="size-4 shrink-0 text-capability" />
                            <span className="min-w-0 flex-1 truncate font-mono text-xs">
                              {file.path}
                            </span>
                            {fileErrors > 0 ? (
                              <span className="text-[10px] text-destructive">
                                {fileErrors} error{fileErrors === 1 ? "" : "s"}
                              </span>
                            ) : fileWarnings > 0 ? (
                              <span className="text-[10px] text-warning">
                                {fileWarnings} warning{fileWarnings === 1 ? "" : "s"}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[10px] text-primary">
                                <Check className="size-3" />
                                valid
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-border bg-card">
                <header className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold">Capability readiness</h2>
                    <p className="text-[11px] text-muted-foreground">
                      Authored capabilities and the interfaces that back them.
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="text-xs">
                    <Link to="/catalogue">Open catalogue</Link>
                  </Button>
                </header>
                {catalogue.capabilities.length === 0 ? (
                  <p className="p-6 text-center text-xs text-muted-foreground">
                    No authored capabilities are available yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {catalogue.capabilities.slice(0, 6).map((capability) => (
                      <li key={capability.name} className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Box className="size-3.5 text-capability" />
                          <span className="min-w-0 flex-1 truncate text-xs font-medium">
                            {capability.name}
                          </span>
                          <span
                            className={
                              capability.eligible
                                ? "text-[10px] text-primary"
                                : "text-[10px] text-warning"
                            }
                          >
                            {capability.eligible ? "usable" : "needs attention"}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {capability.componentInterface
                            ? `Interface: ${capability.componentInterface}`
                            : "No component interface bound"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="mt-8 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">Assurance gates</h2>
                <Button asChild variant="link" size="sm" className="ml-auto h-auto p-0 text-xs">
                  <Link to="/trust">Open trust centre →</Link>
                </Button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {assurance.gates.map((gate) => (
                  <div
                    key={gate.id}
                    className="flex items-start gap-2 rounded-md border border-border p-3"
                  >
                    {gate.status === "pass" ? (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    ) : (
                      <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                    )}
                    <div>
                      <p className="text-xs font-medium">{gate.label}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{gate.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function FlowCard({
  icon: Icon,
  label,
  to,
  value,
  detail,
  state,
}: {
  icon: typeof Activity;
  label: string;
  to: string;
  value: string;
  detail: string;
  state: "pass" | "attention";
}) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-capability" />
        <span className="text-sm font-medium">{label}</span>
        {state === "pass" ? (
          <Check className="ml-auto size-4 text-primary" />
        ) : (
          <CircleAlert className="ml-auto size-4 text-warning" />
        )}
      </div>
      <p className="mt-3 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
    </Link>
  );
}

function Metric({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "good" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "good" ? "text-primary" : tone === "warn" ? "text-warning" : "text-foreground";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}

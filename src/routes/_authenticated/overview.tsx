import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Activity,
  BookOpen,
  Box,
  Check,
  CircleAlert,
  CreditCard,
  FolderKanban,
  GitBranch,
  History,
  Library,
  ListTree,
  LockKeyhole,
  Play,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { linkFrom, useWorkspaceSources } from "@/lib/kide/workspace-store";
import { buildCatalogue } from "@/lib/kide/catalogue";
import { synthesize } from "@/lib/kide/synthesis";
import { buildAssurance } from "@/lib/kide/assurance";
import { useApprovalState } from "@/lib/kide/approval-store";

const title = "KIDE — System overview";
const description =
  "Live overview of the KIDE engineering baseline: model health, the seven-stage flow, synthesis readiness and release gates.";

export const Route = createFileRoute("/_authenticated/overview")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const sources = useWorkspaceSources();
  const workspace = useMemo(() => linkFrom(sources), [sources]);
  const catalogue = useMemo(() => buildCatalogue(workspace), [workspace]);
  const report = useMemo(() => synthesize(workspace), [workspace]);
  const approval = useApprovalState();
  const assurance = useMemo(
    () => buildAssurance(workspace, report, approval.selectedId),
    [workspace, report, approval.selectedId],
  );

  const errors = workspace.files.reduce(
    (sum, file) => sum + file.diagnostics.filter((d) => d.severity === "error").length,
    0,
  );
  const warnings = workspace.files.reduce(
    (sum, file) => sum + file.diagnostics.filter((d) => d.severity === "warning").length,
    0,
  );
  const gatesPassed = assurance.gates.filter((gate) => gate.status === "pass").length;

  const stages = [
    {
      label: "Intent",
      icon: BookOpen,
      to: "/models",
      detail: `${workspace.files.length} models linked`,
      done: errors === 0,
    },
    {
      label: "Knowledge",
      icon: Library,
      to: "/models",
      detail: `${catalogue.devices.length} device interfaces`,
      done: catalogue.devices.length > 0,
    },
    {
      label: "Capabilities",
      icon: Box,
      to: "/catalogue",
      detail: `${catalogue.eligibleCount} of ${catalogue.capabilities.length} usable`,
      done: catalogue.eligibleCount > 0,
    },
    {
      label: "Activities",
      icon: Activity,
      to: "/designer",
      detail: report.diagram ? `Workflow ${report.diagram}` : "No workflow yet",
      done: Boolean(report.diagram),
    },
    {
      label: "Synthesis",
      icon: GitBranch,
      to: "/synthesis",
      detail: report.ready ? `${report.candidates.length} candidate designs` : "Blocked by preflight",
      done: report.ready,
    },
    {
      label: "Verification",
      icon: ShieldCheck,
      to: "/trust",
      detail: `${assurance.blockers} blockers · ${assurance.tracedPercent}% traced`,
      done: assurance.blockers === 0,
    },
    {
      label: "Release",
      icon: Upload,
      to: "/release",
      detail: assurance.releasable ? "Ready to export" : `${gatesPassed}/${assurance.gates.length} gates passed`,
      done: assurance.releasable,
    },
  ] as const;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex h-14 flex-wrap items-center gap-1 border-b border-border bg-card px-3">
        <Link to="/overview" className="mr-3 flex items-center gap-2">
          <img src="/favicon.png" alt="" className="size-8" />
          <div>
            <div className="text-sm font-semibold">KIDE</div>
            <div className="text-[10px] text-muted-foreground">SYSTEMS WORKBENCH</div>
          </div>
        </Link>
        <Button asChild variant="ghost" size="sm" className="text-xs">
          <Link to="/projects">Projects</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="text-xs">
          <Link to="/models">Model languages</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="text-xs">
          <Link to="/catalogue">Catalogue</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="text-xs">
          <Link to="/trust">Trust centre</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="text-xs">
          <Link to="/release">Release</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="text-xs">
          <Link to="/billing">Billing</Link>
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild size="sm">
            <Link to="/auth">
              <LockKeyhole />
              Sign in
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">
        <section className="flex flex-wrap items-end gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">Active baseline</p>
            <h1 className="mt-1 text-2xl font-semibold">Warehouse Fleet — Autonomous Routing</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything below is computed live from the five linked engineering models.
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/scenario">
                <Play />
                Run scenario
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/workbench">
                <Sparkles />
                Open workbench
              </Link>
            </Button>
          </div>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Models" value={`${workspace.files.length}`} note="linked and cross-checked" />
          <Metric
            label="Problems"
            value={`${errors} / ${warnings}`}
            note="errors / warnings"
            tone={errors > 0 ? "bad" : warnings > 0 ? "warn" : "good"}
          />
          <Metric
            label="Candidate designs"
            value={`${report.candidates.length}`}
            note={report.ready ? "preflight passed" : "preflight blocked"}
            tone={report.ready ? "good" : "bad"}
          />
          <Metric
            label="Release gates"
            value={`${gatesPassed}/${assurance.gates.length}`}
            note={assurance.releasable ? "ready to export" : "export blocked"}
            tone={assurance.releasable ? "good" : "warn"}
          />
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold">Engineering flow</h2>
          <p className="text-xs text-muted-foreground">Seven stages from intent to a signed release bundle.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stages.map((stage, index) => (
              <Link
                key={stage.label}
                to={stage.to}
                className="rounded-md border border-border bg-card p-4 transition-colors hover:border-primary/50"
              >
                <div className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded bg-secondary font-mono text-[10px]">
                    {index + 1}
                  </span>
                  <stage.icon className="size-4 text-capability" />
                  <span className="text-sm font-medium">{stage.label}</span>
                  {stage.done ? (
                    <Check className="ml-auto size-4 text-primary" />
                  ) : (
                    <CircleAlert className="ml-auto size-4 text-warning" />
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">{stage.detail}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Assurance summary</h2>
            <div className="mt-3 space-y-2 text-xs">
              {assurance.gates.map((gate) => (
                <div key={gate.id} className="flex items-start gap-2">
                  {gate.status === "pass" ? (
                    <Check className="mt-0.5 size-3.5 text-primary" />
                  ) : (
                    <CircleAlert className="mt-0.5 size-3.5 text-destructive" />
                  )}
                  <div>
                    <p className="font-medium">{gate.label}</p>
                    <p className="text-[11px] text-muted-foreground">{gate.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button asChild variant="link" size="sm" className="mt-2 h-auto p-0 text-xs">
              <Link to="/trust">Open trust centre →</Link>
            </Button>
          </div>

          <div className="rounded-md border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Workspace</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Shortcut to="/projects" icon={FolderKanban} label="Projects" note="All organizations and projects" />
              <Shortcut to="/team" icon={Users} label="Team" note="Members, roles and invitations" />
              <Shortcut to="/checkpoints" icon={History} label="Checkpoints" note="Saved snapshots and imports" />
              <Shortcut to="/reviews" icon={ListTree} label="Reviews" note="Approvals and comments" />
              <Shortcut to="/billing" icon={CreditCard} label="Plan & billing" note="Subscription and invoices" />
              <Shortcut to="/qualification" icon={ShieldCheck} label="Qualification" note="Algorithm evidence report" />
            </div>
          </div>
        </section>
      </div>
    </main>
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
  tone?: "good" | "warn" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-primary"
      : tone === "warn"
        ? "text-warning"
        : tone === "bad"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}

function Shortcut({
  to,
  icon: Icon,
  label,
  note,
}: {
  to: string;
  icon: typeof Users;
  label: string;
  note: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-md border border-border bg-background p-3 transition-colors hover:border-primary/50"
    >
      <div className="flex items-center gap-2 text-xs font-medium">
        <Icon className="size-3.5 text-capability" />
        {label}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
    </Link>
  );
}

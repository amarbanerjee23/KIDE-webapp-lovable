import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Activity, Bell, BookOpen, Box, Check, ChevronDown, CircleAlert, GitBranch,
  History, LayoutDashboard, Library, ListTree, LockKeyhole, Network, PanelLeftClose,
  Play, Search, Settings, ShieldCheck, Sparkles, TerminalSquare, Upload, Users,
} from "lucide-react";
import { KideDiagram } from "@/components/kide/KideDiagram";
import { MonacoDslEditor } from "@/components/kide/MonacoDslEditor";
import { FormEditor } from "@/components/kide/FormEditor";
import { HistoryPanel, type Checkpoint } from "@/components/kide/HistoryPanel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseModel, SAMPLES } from "@/lib/kide-dsl";
import { linkFrom, setSource as setWorkspaceSource, useWorkspaceSources } from "@/lib/kide/workspace-store";

const title = "Activity workbench — KIDE";
const description = "Design activities, synthesize deterministic control models, and inspect engineering evidence in one workspace.";

export const Route = createFileRoute("/workbench")({
  head: () => ({ meta: [
    { title }, { name: "description", content: description },
    { property: "og:title", content: title }, { property: "og:description", content: description },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: KideWorkbench,
});

const stages = [
  ["Intent", BookOpen, "complete"], ["Knowledge", Library, "complete"],
  ["Capabilities", Box, "complete"], ["Activities", Activity, "active"],
  ["Synthesis", GitBranch, "ready"], ["Verification", ShieldCheck, "pending"],
  ["Release", Upload, "pending"],
] as const;

const STAGE_LINKS: Record<string, string> = {
  Intent: "/models",
  Knowledge: "/models",
  Capabilities: "/catalogue",
  Activities: "/designer",
  Synthesis: "/synthesis",
  Verification: "/trust",
  Release: "/release",
};

function KideWorkbench() {
  const [source, setSource] = useState(SAMPLES[0]?.source ?? "");
  const [mode, setMode] = useState("visual");
  const [selected, setSelected] = useState("PlanRoute");
  const [query, setQuery] = useState("");
  const [navOpen, setNavOpen] = useState(true);
  const model = useMemo(() => parseModel(source), [source]);
  const workspaceSources = useWorkspaceSources();
  const linkedWorkspace = useMemo(() => linkFrom(workspaceSources), [workspaceSources]);
  const activityFile = linkedWorkspace.files.find((file) => file.path === "MissionPlanning.activity");
  const errors = model.diagnostics.filter((item) => item.severity === "error");
  const warnings = model.diagnostics.filter((item) => item.severity === "warning");
  const activityCount = model.capabilities.reduce((sum, capability) => sum + capability.activities.length, 0);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);

  const allActivities = model.capabilities.flatMap((capability) =>
    capability.activities.map((activity) => ({ activity, capability })),
  );
  const selectedEntry =
    allActivities.find((entry) => entry.activity.id === selected) ?? allActivities[0];
  const selectedActivity = selectedEntry?.activity;
  const selectedCapability = selectedEntry?.capability;
  const needle = query.trim().toLowerCase();
  const visibleCapabilities = needle
    ? model.capabilities.filter(
        (capability) =>
          capability.label.toLowerCase().includes(needle) ||
          capability.id.toLowerCase().includes(needle) ||
          capability.activities.some(
            (activity) =>
              activity.label.toLowerCase().includes(needle) ||
              activity.id.toLowerCase().includes(needle),
          ),
      )
    : model.capabilities;

  const makeCheckpoint = (label: string, text: string): Checkpoint => {
    const parsed = parseModel(text);
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      at: new Date().toLocaleString(),
      source: text,
      capabilities: parsed.capabilities.length,
      activities: parsed.capabilities.reduce((sum, c) => sum + c.activities.length, 0),
      errors: parsed.diagnostics.filter((d) => d.severity === "error").length,
    };
  };

  const saveCheckpoint = () =>
    setCheckpoints((prev) => [
      makeCheckpoint(`Checkpoint ${prev.length + 1}`, source),
      ...prev,
    ]);

  const restoreCheckpoint = (checkpoint: Checkpoint) => {
    setCheckpoints((prev) => [makeCheckpoint("Draft before restore", source), ...prev]);
    setSource(checkpoint.source);
  };


  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center border-b border-border bg-card px-3">
        <div className="flex w-56 items-center gap-2 border-r border-border pr-4">
          <div className="grid size-8 place-items-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground">KI</div>
          <div><div className="text-sm font-semibold">KIDE</div><div className="text-[10px] text-muted-foreground">SYSTEMS WORKBENCH</div></div>
        </div>
        <Button variant="ghost" className="ml-3 h-9 justify-start gap-2 px-2 text-xs"><span className="grid size-6 place-items-center rounded bg-capability/15 font-semibold text-capability">AR</span>Autonomous Routing<ChevronDown className="size-3.5" /></Button>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs"><Link to="/">Overview</Link></Button><Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs"><Link to="/projects">Projects</Link></Button>
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs"><Link to="/models"><ListTree className="size-3.5" />Model languages</Link></Button>
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs"><Link to="/billing">Billing</Link></Button>
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs"><Link to="/catalogue">Catalogue</Link></Button>
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs"><Link to="/trust">Trust centre</Link></Button>
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs"><Link to="/release">Release</Link></Button>
          <Button variant="ghost" size="icon" title="Search capabilities" aria-label="Search capabilities" onClick={() => { setMode("visual"); requestAnimationFrame(() => document.getElementById("capability-search")?.focus()); }}><Search /></Button>
          <Button asChild variant="ghost" size="icon" title="Notifications" aria-label="Notifications"><Link to="/notifications"><Bell /></Link></Button>
          <Button asChild size="sm"><Link to="/auth"><LockKeyhole />Sign in</Link></Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className={`${navOpen ? "w-60" : "w-14"} hidden shrink-0 flex-col border-r border-border bg-sidebar transition-[width] lg:flex`}>
          <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-3">
            {navOpen ? <div><p className="text-xs font-medium">Warehouse Fleet</p><p className="text-[10px] text-muted-foreground">Design baseline v12</p></div> : null}
            <Button variant="ghost" size="icon" className="size-7" aria-label={navOpen ? "Collapse navigation" : "Expand navigation"} aria-expanded={navOpen} onClick={() => setNavOpen((open) => !open)}><PanelLeftClose className={navOpen ? "" : "rotate-180"} /></Button>
          </div>
          <nav className="flex-1 p-2" aria-label="Engineering workflow">
            <NavItem icon={LayoutDashboard} label="Overview" to="/" collapsed={!navOpen} />
            <p className="mb-1 mt-4 px-2 text-[10px] font-semibold text-muted-foreground uppercase">Engineering flow</p>
            {stages.map(([label, Icon, status], index) => (
              <NavItem key={label} icon={Icon} label={label} step={index + 1} active={status === "active"} done={status === "complete"} to={STAGE_LINKS[label] ?? "/"} collapsed={!navOpen} />
            ))}
            <p className="mb-1 mt-4 px-2 text-[10px] font-semibold text-muted-foreground uppercase">Workspace</p>
            <NavItem icon={Users} label="Reviews" to="/reviews" collapsed={!navOpen} />
            <NavItem icon={History} label="Audit history" to="/checkpoints" collapsed={!navOpen} />
            <NavItem icon={Settings} label="Settings" to="/profile" collapsed={!navOpen} />
          </nav>
          <div className="border-t border-sidebar-border p-3">
            <div className="flex items-center gap-2 text-xs"><span className="size-2 rounded-full bg-primary" />{navOpen ? " All systems operational" : null}</div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-border bg-card/80 px-4 py-2">
            <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-base font-semibold">Mission Planning Activity</h1><span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">VALID</span></div><p className="text-[11px] text-muted-foreground">Activities / MissionPlanning.activity · saved moments ago</p></div>
            <div className="ml-auto flex items-center gap-2"><Button asChild variant="outline" size="sm"><Link to="/scenario"><Play />Run scenario</Link></Button><Button asChild size="sm"><Link to="/synthesis"><Sparkles />Synthesize</Link></Button></div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_290px]">
            <div className="flex min-h-[720px] min-w-0 flex-col border-r border-border">
              <Tabs value={mode} onValueChange={setMode} className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center border-b border-border bg-card px-3">
                  <TabsList className="h-10 rounded-none bg-transparent p-0">
                    <TabsTrigger value="visual" className="h-10 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"><Network />Visual</TabsTrigger>
                    <TabsTrigger value="source" className="h-10 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"><TerminalSquare />Source</TabsTrigger>
                    <TabsTrigger value="form" className="h-10 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"><ListTree />Form</TabsTrigger>
                    <TabsTrigger value="trace" className="h-10 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"><GitBranch />Trace</TabsTrigger>
                    <TabsTrigger value="history" className="h-10 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"><History />History</TabsTrigger>
                  </TabsList>
                  <div className="ml-auto flex gap-3 font-mono text-[10px] text-muted-foreground"><span>{model.capabilities.length} capabilities</span><span>{activityCount} activities</span><span>{model.resources.length} artefacts</span></div>
                </div>
                <TabsContent value="visual" className="m-0 grid min-h-0 flex-1 lg:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="border-r border-border bg-card/50 p-3">
                    <label className="relative block"><Search className="absolute left-2 top-2.5 size-3.5 text-muted-foreground" /><input id="capability-search" value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring" placeholder="Find capabilities" aria-label="Find capabilities" /></label>
                    <p className="mb-2 mt-4 text-[10px] font-semibold text-muted-foreground uppercase">Available capabilities</p>
                    {visibleCapabilities.length === 0 ? <p className="text-[11px] text-muted-foreground">No capability matches “{query}”.</p> : null}
                    {visibleCapabilities.map((capability) => (
                      <div key={capability.id} className="mb-2 rounded-md border border-border bg-card p-3">
                        <button
                          type="button"
                          onClick={() => setSelected(capability.activities[0]?.id ?? capability.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center gap-2 text-xs font-medium"><Box className="size-3.5 text-capability" />{capability.label}</div>
                          <p className="mt-1 text-[10px] text-muted-foreground">{capability.activities.length} eligible activities</p>
                        </button>
                        <div className="mt-2 space-y-1">
                          {capability.activities.map((activity) => (
                            <button
                              key={activity.id}
                              type="button"
                              aria-pressed={selected === activity.id}
                              onClick={() => setSelected(activity.id)}
                              className={`block w-full truncate rounded px-2 py-1 text-left text-[11px] ${selected === activity.id ? "bg-activity/15 text-activity" : "text-muted-foreground hover:bg-muted"}`}
                            >
                              {activity.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="relative min-h-[560px] overflow-auto bg-background/50 p-5"><KideDiagram model={model} /></div>
                </TabsContent>
                <TabsContent value="source" className="m-0 min-h-0 flex-1">
                  <div className="flex h-full min-h-[560px] flex-col">
                    <div className="flex items-center gap-2 border-b border-border bg-card/60 px-3 py-1.5 text-[10px] text-muted-foreground">
                      <span className="font-mono">MissionPlanning.activity</span>
                      <span>· completion, hover docs and live checking against the KIDE activity grammar</span>
                      <Link to="/models" className="ml-auto text-primary hover:underline">Open all five models</Link>
                    </div>
                    <div className="min-h-0 flex-1">
                      <MonacoDslEditor
                        path="MissionPlanning.activity"
                        kind="activity"
                        value={workspaceSources["MissionPlanning.activity"] ?? ""}
                        diagnostics={activityFile?.diagnostics ?? []}
                        getSymbols={() => linkedWorkspace.symbols}
                        onChange={(next: string) => setWorkspaceSource("MissionPlanning.activity", next)}
                      />
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="form" className="m-0 min-h-0 flex-1"><FormEditor model={model} onChange={setSource} /></TabsContent>
                <TabsContent value="trace" className="m-0 min-h-0 flex-1 p-6"><TraceView /></TabsContent>
                <TabsContent value="history" className="m-0 min-h-0 flex-1"><HistoryPanel checkpoints={checkpoints} activeSource={source} onSave={saveCheckpoint} onRestore={restoreCheckpoint} /></TabsContent>
              </Tabs>
              <div className="border-t border-border bg-card px-3 py-2">
                <div className="flex items-center gap-3 text-[11px]"><span className="font-semibold">Problems</span><span className="text-destructive">{errors.length} errors</span><span className="text-warning">{warnings.length} warnings</span><span className="ml-auto text-muted-foreground">Deterministic validator · ruleset 1.0</span></div>
                {model.diagnostics[0] ? <p className="mt-2 flex items-center gap-2 text-xs"><CircleAlert className="size-3.5 text-warning" /><span className="font-mono text-muted-foreground">Line {model.diagnostics[0].line}</span>{model.diagnostics[0].message}</p> : <p className="mt-2 flex items-center gap-2 text-xs text-primary"><Check className="size-3.5" />Model is consistent and ready for synthesis preflight.</p>}
              </div>
            </div>

            <aside className="hidden bg-card/70 xl:block">
              <div className="border-b border-border px-4 py-3"><p className="text-xs font-semibold">Inspector</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">activity / {selectedActivity?.id ?? "none"}</p></div>
              <div className="space-y-5 p-4">
                <Field label="Name" value={selectedActivity?.label ?? "No activity selected"} />
                <Field label="Identifier" value={selectedActivity?.id ?? "—"} mono />
                <Field label="Capability" value={selectedCapability?.label ?? "—"} />
                <div>
                  <p className="mb-2 text-[10px] font-semibold text-muted-foreground uppercase">Inputs</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedActivity?.requires.length ? selectedActivity.requires.map((item) => <Chip key={item} label={item} tone="data" />) : <span className="text-[11px] text-muted-foreground">None declared</span>}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[10px] font-semibold text-muted-foreground uppercase">Outputs</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedActivity?.produces.length ? selectedActivity.produces.map((item) => <Chip key={item} label={item} tone="activity" />) : <span className="text-[11px] text-muted-foreground">None declared</span>}
                  </div>
                </div>
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-primary"><ShieldCheck className="size-4" />{(selectedActivity?.requires.length ?? 0) + (selectedActivity?.produces.length ?? 0) > 0 ? "Evidence complete" : "Evidence incomplete"}</div>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    {selectedCapability ? 1 : 0} capability · {selectedActivity?.requires.length ?? 0} inputs · {selectedActivity?.produces.length ?? 0} outputs · defined at line {selectedActivity?.line ?? 0}
                  </p>
                  <Button asChild variant="link" size="sm" className="mt-1 h-auto p-0 text-xs"><Link to="/trust">Open provenance →</Link></Button>
                </div>
                <div><p className="mb-2 text-[10px] font-semibold text-muted-foreground uppercase">Synthesis readiness</p><div className="space-y-2 text-[11px]"><CheckRow label="Inputs declared" ok={(selectedActivity?.requires.length ?? 0) > 0} /><CheckRow label="Outputs declared" ok={(selectedActivity?.produces.length ?? 0) > 0} /><CheckRow label="Belongs to a capability" ok={Boolean(selectedCapability)} /><CheckRow label="Model has no errors" ok={errors.length === 0} /></div></div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function NavItem({ icon: Icon, label, active, done, step, to, collapsed }: { icon: typeof Activity; label: string; active?: boolean; done?: boolean; step?: number; to: string; collapsed?: boolean }) {
  return (
    <Button asChild variant="ghost" title={label} className={`mb-0.5 h-9 w-full justify-start px-2 text-xs ${active ? "bg-sidebar-accent text-primary" : "text-sidebar-foreground/75"}`}>
      <Link to={to}>
        <span className="grid size-5 place-items-center">{done ? <Check className="size-3.5 text-primary" /> : step ? <span className="font-mono text-[10px]">{step}</span> : <Icon />}</span>
        {collapsed ? null : label}
      </Link>
    </Button>
  );
}
function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div><label className="mb-1.5 block text-[10px] font-semibold text-muted-foreground uppercase">{label}</label><div className={`rounded-md border border-input bg-background px-2.5 py-2 text-xs ${mono ? "font-mono" : ""}`}>{value}</div></div>; }
function Chip({ label, tone }: { label: string; tone: "data" | "activity" }) { return <span className={`inline-flex items-center rounded border px-2 py-1 font-mono text-[10px] ${tone === "data" ? "border-resource/40 bg-resource/10 text-resource" : "border-activity/40 bg-activity/10 text-activity"}`}>{label}</span>; }
function CheckRow({ label, ok }: { label: string; ok: boolean }) { return <div className="flex items-center gap-2"><span className={`grid size-4 place-items-center rounded-full ${ok ? "bg-primary/15" : "bg-warning/20"}`}>{ok ? <Check className="size-2.5 text-primary" /> : <CircleAlert className="size-2.5 text-warning" />}</span><span className={ok ? "" : "text-muted-foreground"}>{label}</span></div>; }
function TraceView() { return <div className="mx-auto max-w-3xl"><div className="mb-5"><h2 className="text-lg font-semibold">Trace explorer</h2><p className="text-sm text-muted-foreground">Follow every engineering decision from requirement to generated control element.</p></div><div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3"><TraceCard type="Requirement" title="Optimize fleet route" meta="REQ-014" /><span className="text-muted-foreground">→</span><TraceCard type="Capability" title="Fleet Operations" meta="CAP-002" /><span className="text-muted-foreground">→</span><TraceCard type="Activity" title="Plan Route" meta="ACT-005" /></div></div>; }
function TraceCard({ type, title, meta }: { type: string; title: string; meta: string }) { return <div className="rounded-md border border-border bg-card p-4"><p className="text-[10px] font-semibold text-capability uppercase">{type}</p><p className="mt-2 text-sm font-medium">{title}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{meta}</p></div>; }
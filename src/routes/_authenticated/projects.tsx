import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileCode2, FolderKanban, Plus, Users } from "lucide-react";
import { WorkspaceHeader } from "@/components/kide/WorkspaceHeader";
import { Button } from "@/components/ui/button";
import { listAllProjects, createProject } from "@/lib/projects.functions";
import { createOrganization } from "@/lib/teams.functions";
import { setActiveProject } from "@/lib/active-project";

const title = "Your projects — KIDE";
const description =
  "Every organization and engineering project in your KIDE workspace, with status, stage and quick entry into the workbench.";

export const Route = createFileRoute("/_authenticated/projects")({
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
  component: ProjectsHome,
});

type Org = Awaited<ReturnType<typeof listAllProjects>>["organizations"][number];

const STAGES = [
  "Intent",
  "Knowledge",
  "Capabilities",
  "Activities",
  "Synthesis",
  "Verification",
  "Release",
];

const PROJECT_FILES = [
  { path: "Ecre.dml", label: "Data model" },
  { path: "Ecre.op", label: "Operations" },
  { path: "Ecre.mncspec", label: "MNC specification" },
  { path: "Ecre.cap", label: "Capabilities" },
  { path: "MissionPlanning.activity", label: "Activity workflow" },
] as const;

function stageLabel(stage: number) {
  return STAGES[Math.min(Math.max(stage, 1), 7) - 1];
}

function statusTone(status: string) {
  switch (status) {
    case "released":
      return "border-data/50 bg-data/10 text-data";
    case "approved":
      return "border-capability/50 bg-capability/10 text-capability";
    case "in_review":
      return "border-activity/50 bg-activity/10 text-activity";
    case "archived":
      return "border-border bg-secondary text-muted-foreground";
    default:
      return "border-border bg-secondary/60 text-foreground";
  }
}

function ProjectsHome() {
  const load = useServerFn(listAllProjects);
  const addProject = useServerFn(createProject);
  const addOrg = useServerFn(createOrganization);

  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [projectName, setProjectName] = useState<Record<string, string>>({});
  const [orgName, setOrgName] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setOrgs((await load()).organizations);
  }, [load]);

  useEffect(() => {
    refresh().catch((error) =>
      toast.error(error instanceof Error ? error.message : "Could not load your projects."),
    );
  }, [refresh]);

  const run = async (message: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const totalProjects = (orgs ?? []).reduce((sum, org) => sum + org.projects.length, 0);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <WorkspaceHeader current="Projects" />
      <div className="mx-auto max-w-5xl p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Your projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {orgs === null
                ? "Loading your workspace…"
                : `${totalProjects} project${totalProjects === 1 ? "" : "s"} across ${orgs.length} organization${orgs.length === 1 ? "" : "s"}.`}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/billing">Plan &amp; billing</Link>
          </Button>
        </div>

        {orgs !== null && orgs.length === 0 && (
          <section className="mt-6 rounded-md border border-dashed border-border bg-card p-8 text-center">
            <Users className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-3 text-sm font-semibold">Create your first organization</h2>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Organizations hold your projects, team members and billing plan.
            </p>
            <form
              className="mx-auto mt-4 flex max-w-sm gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!orgName.trim()) return;
                void run("Organization created", async () => {
                  await addOrg({ data: { name: orgName } });
                  setOrgName("");
                });
              }}
            >
              <input
                value={orgName}
                onChange={(event) => setOrgName(event.target.value)}
                placeholder="Acme Robotics"
                className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <Button type="submit" disabled={busy}>
                Create
              </Button>
            </form>
          </section>
        )}

        <div className="mt-6 space-y-6">
          {(orgs ?? []).map((org) => (
            <section key={org.id} className="rounded-md border border-border bg-card">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">{org.name}</h2>
                  <p className="text-[11px] text-muted-foreground">You are {org.role}</p>
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const name = (projectName[org.id] ?? "").trim();
                    if (!name) return;
                    void run("Project created", async () => {
                      await addProject({ data: { organizationId: org.id, name } });
                      setProjectName((current) => ({ ...current, [org.id]: "" }));
                    });
                  }}
                >
                  <input
                    value={projectName[org.id] ?? ""}
                    onChange={(event) =>
                      setProjectName((current) => ({ ...current, [org.id]: event.target.value }))
                    }
                    placeholder="New project name"
                    className="h-8 w-48 rounded-md border border-input bg-background px-3 text-xs outline-none focus:ring-1 focus:ring-ring"
                  />
                  <Button type="submit" size="sm" disabled={busy}>
                    <Plus /> Project
                  </Button>
                </form>
              </header>

              {org.projects.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No projects yet — create one above.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {org.projects.map((project) => (
                    <li key={project.id} className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-secondary/60">
                          <FolderKanban className="size-4 text-muted-foreground" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{project.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {project.description ||
                              `Stage ${project.current_stage} · ${stageLabel(project.current_stage)}`}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusTone(project.status)}`}
                        >
                          {project.status.replace("_", " ")}
                        </span>
                        <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:block">
                          {new Date(project.updated_at).toLocaleDateString()}
                        </span>
                        <Button asChild size="sm" variant="outline" className="shrink-0">
                          <Link
                            to="/overview"
                            onClick={() =>
                              setActiveProject({
                                projectId: project.id,
                                organizationId: org.id,
                              })
                            }
                          >
                            Open overview
                          </Link>
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-1 border-t border-border pt-3 sm:ml-13 sm:grid-cols-2 lg:grid-cols-5">
                        {PROJECT_FILES.map((file) => (
                          <Link
                            key={file.path}
                            to="/models"
                            hash={file.path}
                            onClick={() =>
                              setActiveProject({
                                projectId: project.id,
                                organizationId: org.id,
                              })
                            }
                            className="flex min-w-0 items-center gap-2 rounded border border-transparent px-2 py-2 text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-secondary/50 hover:text-foreground"
                          >
                            <FileCode2 className="size-3.5 shrink-0 text-capability" />
                            <span className="min-w-0">
                              <span className="block truncate font-mono text-foreground">
                                {file.path}
                              </span>
                              <span className="block truncate text-[10px]">{file.label}</span>
                            </span>
                          </Link>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

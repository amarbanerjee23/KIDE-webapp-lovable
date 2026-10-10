import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, FolderKanban, Plus, Users } from "lucide-react";
import { WorkspaceHeader } from "@/components/kide/WorkspaceHeader";
import { Button } from "@/components/ui/button";
import { listAllProjects, createProject } from "@/lib/projects.functions";
import { createOrganization } from "@/lib/teams.functions";
import { setActiveProject } from "@/lib/active-project";
import { PROJECT_TEMPLATE_CATALOG } from "@/lib/project-templates";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<Record<string, string>>({});
  const [orgName, setOrgName] = useState("");
  const [busy, setBusy] = useState(false);
  const [projectErrors, setProjectErrors] = useState<Record<string, string>>({});
  const [selectedExampleOrgId, setSelectedExampleOrgId] = useState("");
  const [recentCreated, setRecentCreated] = useState<{
    organizationId: string;
    projectId: string;
    name: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await load();
      setOrgs(result.organizations);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load your projects.");
      throw error;
    }
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

  const canCreateIn = (org: Org) => ["owner", "administrator", "engineer"].includes(org.role);

  const writableOrgs = (orgs ?? []).filter(canCreateIn);
  const exampleOrgId = writableOrgs.some((org) => org.id === selectedExampleOrgId)
    ? selectedExampleOrgId
    : (writableOrgs[0]?.id ?? "");

  const createNewProject = async (organizationId: string, name: string, templateId?: string) => {
    if (busy) return;
    setProjectErrors((current) => ({ ...current, [organizationId]: "" }));
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 120) {
      setProjectErrors((current) => ({
        ...current,
        [organizationId]: "Project name must be between 2 and 120 characters.",
      }));
      return;
    }

    setBusy(true);
    try {
      const created = await addProject({
        data: { organizationId, name: cleanName, ...(templateId ? { templateId } : {}) },
      });
      setActiveProject({ projectId: created.id, organizationId });
      setRecentCreated({ organizationId, projectId: created.id, name: created.name });
      setProjectName((current) => ({ ...current, [organizationId]: "" }));
      await refresh();
      toast.success(templateId ? "Example project ready to explore" : "Project created");
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Could not create the project. Please retry.";
      setProjectErrors((current) => ({ ...current, [organizationId]: message }));
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const totalProjects = (orgs ?? []).reduce((sum, org) => sum + org.projects.length, 0);
  const starterOrg = (orgs ?? []).find((org) => org.projects.length > 0);
  const starterProject = starterOrg?.projects[0];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <WorkspaceHeader current="Projects" />
      <div className="mx-auto max-w-5xl p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Your projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {loadError
                ? "Your workspace could not be loaded."
                : orgs === null
                  ? "Loading your workspace…"
                  : `${totalProjects} project${totalProjects === 1 ? "" : "s"} across ${orgs.length} organization${orgs.length === 1 ? "" : "s"}.`}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/billing">Plan &amp; billing</Link>
          </Button>
        </div>

        {loadError ? (
          <section
            role="alert"
            className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 p-5"
          >
            <h2 className="text-sm font-semibold">Could not load your workspace</h2>
            <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
            <Button
              className="mt-4"
              size="sm"
              variant="outline"
              onClick={() =>
                void refresh().catch((error) =>
                  toast.error(
                    error instanceof Error ? error.message : "Could not load your projects.",
                  ),
                )
              }
            >
              Retry
            </Button>
          </section>
        ) : null}

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
                aria-label="Organization name"
                placeholder="Acme Robotics"
                className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <Button type="submit" disabled={busy}>
                Create
              </Button>
            </form>
          </section>
        )}

        {orgs && orgs.length > 0 && totalProjects === 0 && (
          <section
            aria-labelledby="first-project-guide"
            className="mt-6 rounded-lg border border-primary/40 bg-card p-5"
          >
            <p className="text-[11px] font-semibold uppercase text-primary">Start here</p>
            <h2 id="first-project-guide" className="mt-1 text-lg font-semibold">
              Build your first engineering project
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Give your project a name in the organization below. You can then open Model languages
              and load a reference example or build your own models.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Next: link models, run synthesis, review evidence and export a qualified release.
            </p>
          </section>
        )}

        {orgs && totalProjects === 1 && starterOrg && starterProject && (
          <section
            aria-labelledby="first-model-guide"
            className="mt-6 flex flex-wrap items-center gap-4 rounded-lg border border-primary/40 bg-card p-5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase text-primary">Next step</p>
              <h2 id="first-model-guide" className="mt-1 text-lg font-semibold">
                Start your first design
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Open Model languages to create your five linked models, or load a reference example
                to explore a complete workflow. Changes save to the selected project.
              </p>
            </div>
            <Button asChild>
              <Link
                to="/models"
                onClick={() =>
                  setActiveProject({
                    projectId: starterProject.id,
                    organizationId: starterOrg.id,
                  })
                }
              >
                Start modelling
                <ArrowRight />
              </Link>
            </Button>
          </section>
        )}

        {orgs && orgs.length > 0 && (
          <section
            aria-labelledby="example-gallery-title"
            className="mt-6 rounded-lg border border-border bg-card p-5"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase text-primary">
                  Ready-made examples
                </p>
                <h2 id="example-gallery-title" className="mt-1 text-lg font-semibold">
                  Explore five real-world control systems
                </h2>
                <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
                  Start with a building HVAC controller and progress to autonomous fleet operations.
                  Each example creates a private, editable copy containing five linked
                  model-language files. The scenarios are educational references, not validated
                  physical-device configurations.
                </p>
              </div>
              {writableOrgs.length > 0 && (
                <label className="text-xs text-muted-foreground">
                  Create in organization
                  <select
                    aria-label="Example destination organization"
                    className="mt-1 block h-9 max-w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                    value={exampleOrgId}
                    disabled={busy}
                    onChange={(event) => setSelectedExampleOrgId(event.target.value)}
                  >
                    {writableOrgs.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {PROJECT_TEMPLATE_CATALOG.map((template) => (
                <article
                  key={template.id}
                  className="flex min-w-0 flex-col rounded-lg border border-border bg-background p-4"
                >
                  <p className="text-[10px] font-semibold uppercase text-primary">
                    Level {template.level} of 5 · {template.difficulty} · {template.domain}
                  </p>
                  <h3 className="mt-2 text-sm font-semibold">{template.title}</h3>
                  <p className="mt-2 flex-1 text-xs text-muted-foreground">{template.summary}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    <strong className="text-foreground">You will learn:</strong>{" "}
                    {template.learningGoal}
                  </p>
                  <Button
                    className="mt-4 self-start"
                    size="sm"
                    variant="outline"
                    disabled={busy || !exampleOrgId}
                    onClick={() => void createNewProject(exampleOrgId, template.title, template.id)}
                  >
                    Use {template.title} example
                    <ArrowRight className="size-3.5" />
                  </Button>
                </article>
              ))}
            </div>
            {writableOrgs.length === 0 && (
              <p role="status" className="mt-4 text-xs text-muted-foreground">
                You have read-only or reviewer access to these organizations. Ask an owner or
                administrator for engineer access before creating a project.
              </p>
            )}
            {exampleOrgId && projectErrors[exampleOrgId] && (
              <p role="alert" className="mt-3 text-xs text-destructive">
                {projectErrors[exampleOrgId]}
              </p>
            )}
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
                {canCreateIn(org) ? (
                  <form
                    className="flex flex-wrap gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void createNewProject(org.id, projectName[org.id] ?? "");
                    }}
                  >
                    <input
                      value={projectName[org.id] ?? ""}
                      onChange={(event) =>
                        setProjectName((current) => ({ ...current, [org.id]: event.target.value }))
                      }
                      aria-label={`New project name for ${org.name}`}
                      placeholder="New project name"
                      minLength={2}
                      maxLength={120}
                      required
                      className="h-8 w-48 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs outline-none focus:ring-1 focus:ring-ring sm:flex-none"
                    />
                    <Button type="submit" size="sm" disabled={busy}>
                      <Plus /> Project
                    </Button>
                  </form>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Your {org.role} role cannot create projects.
                  </p>
                )}
              </header>
              {projectErrors[org.id] && (
                <p
                  role="alert"
                  className="border-b border-destructive/30 px-4 py-2 text-xs text-destructive"
                >
                  {projectErrors[org.id]}
                </p>
              )}
              {recentCreated?.organizationId === org.id && (
                <div
                  role="status"
                  className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-4 py-3 text-xs"
                >
                  <span className="min-w-0 flex-1 font-medium">
                    Project created successfully.
                  </span>
                  <Button asChild size="sm">
                    <Link
                      to="/models"
                      onClick={() =>
                        setActiveProject({
                          projectId: recentCreated.projectId,
                          organizationId: org.id,
                        })
                      }
                    >
                      Open new project
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              )}

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
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3 sm:ml-13">
                        <Button asChild size="sm" variant="ghost" className="text-xs">
                          <Link
                            to="/models"
                            onClick={() =>
                              setActiveProject({
                                projectId: project.id,
                                organizationId: org.id,
                              })
                            }
                          >
                            Open models
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="ghost" className="text-xs">
                          <Link
                            to="/designer"
                            onClick={() =>
                              setActiveProject({
                                projectId: project.id,
                                organizationId: org.id,
                              })
                            }
                          >
                            Activity designer
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="ghost" className="text-xs">
                          <Link
                            to="/workbench"
                            onClick={() =>
                              setActiveProject({
                                projectId: project.id,
                                organizationId: org.id,
                              })
                            }
                          >
                            Workbench
                          </Link>
                        </Button>
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

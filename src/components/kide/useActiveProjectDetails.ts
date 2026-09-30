import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { clearActiveProject, useActiveProject, type ActiveProject } from "@/lib/active-project";
import { listAllProjects } from "@/lib/projects.functions";

type ProjectIndex = Awaited<ReturnType<typeof listAllProjects>>;

export interface ActiveProjectDetails {
  organizationId: string;
  organizationName: string;
  projectId: string;
  projectName: string;
  status: string;
  currentStage: number;
}

export function resolveActiveProjectDetails(
  organizations: ProjectIndex["organizations"],
  activeProject: ActiveProject | null,
): ActiveProjectDetails | null {
  if (!activeProject) return null;

  const organization = organizations.find((item) => item.id === activeProject.organizationId);
  if (!organization) return null;

  const project = organization.projects.find((item) => item.id === activeProject.projectId);
  if (!project) return null;

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    projectId: project.id,
    projectName: project.name,
    status: project.status,
    currentStage: project.current_stage,
  };
}

export function useActiveProjectDetails() {
  const activeProject = useActiveProject();
  const loadProjects = useServerFn(listAllProjects);
  const [details, setDetails] = useState<ActiveProjectDetails | null>(null);
  const [loading, setLoading] = useState(Boolean(activeProject));
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let current = true;

    if (!activeProject) {
      setDetails(null);
      setLoading(false);
      setError(null);
      return () => {
        current = false;
      };
    }

    setLoading(true);
    setError(null);

    void loadProjects()
      .then((result) => {
        if (!current) return;
        const resolved = resolveActiveProjectDetails(result.organizations, activeProject);
        if (!resolved) {
          clearActiveProject();
          setDetails(null);
          return;
        }
        setDetails(resolved);
      })
      .catch((reason) => {
        if (!current) return;
        setDetails(null);
        setError(reason instanceof Error ? reason.message : "Could not load the active project.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [activeProject, loadProjects, refreshVersion]);

  return {
    activeProject,
    details,
    loading,
    error,
    retry: () => setRefreshVersion((version) => version + 1),
  };
}

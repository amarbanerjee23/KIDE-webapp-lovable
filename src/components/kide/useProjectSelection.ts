import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getActiveProject, setActiveProject } from "@/lib/active-project";
import { getOrganization, getWorkspace } from "@/lib/teams.functions";

export interface ProjectOption {
  id: string;
  name: string;
  status: string;
  current_stage: number;
}

/**
 * Shared organization + project picker state used by checkpoint and review
 * pages. The selected project is also the global browser working project.
 */
export function useProjectSelection() {
  const loadWorkspace = useServerFn(getWorkspace);
  const loadOrg = useServerFn(getOrganization);

  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [orgId, setOrgIdState] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string>("viewer");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProjects = useCallback(
    async (id: string) => {
      const org = await loadOrg({ data: { organizationId: id } });
      setMyRole(org.myRole ?? "viewer");
      const list = org.projects as ProjectOption[];
      setProjects(list);

      const active = getActiveProject();
      const preferred =
        active?.organizationId === id && list.some((project) => project.id === active.projectId)
          ? active.projectId
          : (list[0]?.id ?? null);

      setProjectIdState(preferred);
      if (preferred) {
        setActiveProject({ projectId: preferred, organizationId: id });
      } else if (active?.organizationId === id) {
        setActiveProject(null);
      }
    },
    [loadOrg],
  );

  useEffect(() => {
    void (async () => {
      try {
        const data = await loadWorkspace();
        const organizations = data.organizations.map((org) => ({
          id: org.id,
          name: org.name,
          role: org.role,
        }));
        setOrgs(organizations);

        const active = getActiveProject();
        const preferredOrg =
          active && organizations.some((org) => org.id === active.organizationId)
            ? active.organizationId
            : (organizations[0]?.id ?? null);
        setOrgIdState(preferredOrg);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadWorkspace]);

  useEffect(() => {
    if (orgId) {
      void refreshProjects(orgId);
    } else {
      setProjects([]);
      setProjectIdState(null);
    }
  }, [orgId, refreshProjects]);

  const setOrgId = (nextOrgId: string | null) => {
    setOrgIdState(nextOrgId);
  };

  const setProjectId = (nextProjectId: string | null) => {
    setProjectIdState(nextProjectId);
    if (nextProjectId && orgId) {
      setActiveProject({
        projectId: nextProjectId,
        organizationId: orgId,
      });
    } else if (!nextProjectId) {
      setActiveProject(null);
    }
  };

  return {
    orgs,
    orgId,
    setOrgId,
    myRole,
    projects,
    projectId,
    setProjectId,
    refreshProjects,
    loading,
  };
}

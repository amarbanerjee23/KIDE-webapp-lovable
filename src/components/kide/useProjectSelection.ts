import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOrganization, getWorkspace } from "@/lib/teams.functions";

export interface ProjectOption {
  id: string;
  name: string;
  status: string;
  current_stage: number;
}

/**
 * Shared organization + project picker state used by the checkpoint and
 * review pages, so both always act on the same project.
 */
export function useProjectSelection() {
  const loadWorkspace = useServerFn(getWorkspace);
  const loadOrg = useServerFn(getOrganization);

  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string>("viewer");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProjects = useCallback(
    async (id: string) => {
      const org = await loadOrg({ data: { organizationId: id } });
      setMyRole(org.myRole ?? "viewer");
      const list = org.projects as ProjectOption[];
      setProjects(list);
      setProjectId((current) => (current && list.some((p) => p.id === current) ? current : list[0]?.id ?? null));
    },
    [loadOrg],
  );

  useEffect(() => {
    void (async () => {
      try {
        const data = await loadWorkspace();
        setOrgs(data.organizations.map((o) => ({ id: o.id, name: o.name, role: o.role })));
        if (data.organizations[0]) setOrgId(data.organizations[0].id);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadWorkspace]);

  useEffect(() => {
    if (orgId) void refreshProjects(orgId);
  }, [orgId, refreshProjects]);

  return { orgs, orgId, setOrgId, myRole, projects, projectId, setProjectId, refreshProjects, loading };
}

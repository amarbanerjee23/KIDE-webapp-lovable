import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getActiveProject, setActiveProject } from "@/lib/active-project";
import { getOrganization, getWorkspace } from "@/lib/teams.functions";

export interface ProjectOption {
  id: string;
  name: string;
  status: string;
  current_stage: number;
}

export function preferredExplicitProjectId(
  projects: ProjectOption[],
  active: { projectId: string; organizationId: string } | null,
  organizationId: string,
): string | null {
  return active?.organizationId === organizationId &&
    projects.some((project) => project.id === active.projectId)
    ? active.projectId
    : null;
}

/**
 * Shared project picker for Reviews and Checkpoints.
 * Every asynchronous result is scoped to both the selected organization and
 * a monotonically increasing request generation. Old responses cannot replace
 * another tenant's role, project list or active project.
 */
export function useProjectSelection() {
  const loadWorkspace = useServerFn(getWorkspace);
  const loadOrg = useServerFn(getOrganization);
  const selectedOrgRef = useRef<string | null>(null);
  const requestGeneration = useRef(0);
  const allowedProjectsRef = useRef<Set<string>>(new Set());

  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [orgId, setOrgIdState] = useState<string | null>(null);
  const [myRole, setMyRole] = useState("viewer");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshProjects = useCallback(
    async (id: string) => {
      if (selectedOrgRef.current !== id) return;
      const generation = ++requestGeneration.current;
      setProjectsLoading(true);
      setError("");
      try {
        const org = await loadOrg({ data: { organizationId: id } });
        if (selectedOrgRef.current !== id || requestGeneration.current !== generation) return;
        const list = org.projects as ProjectOption[];
        const ids = new Set(list.map((project) => project.id));
        allowedProjectsRef.current = ids;
        setMyRole(org.myRole ?? "viewer");
        setProjects(list);

        const active = getActiveProject();
        const preferred = preferredExplicitProjectId(list, active, id);
        setProjectIdState(preferred);
        if (active && !preferred && active.organizationId === id) {
          setActiveProject(null);
        }
      } catch (cause) {
        if (selectedOrgRef.current !== id || requestGeneration.current !== generation) return;
        allowedProjectsRef.current.clear();
        setProjects([]);
        setProjectIdState(null);
        setMyRole("viewer");
        setError(cause instanceof Error ? cause.message : "Could not load this organization.");
      } finally {
        if (selectedOrgRef.current === id && requestGeneration.current === generation) {
          setProjectsLoading(false);
        }
      }
    },
    [loadOrg],
  );

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const data = await loadWorkspace();
        if (!mounted) return;
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
        selectedOrgRef.current = preferredOrg;
        setOrgIdState(preferredOrg);
        if (!preferredOrg && active) setActiveProject(null);
      } catch (cause) {
        if (mounted) {
          setError(cause instanceof Error ? cause.message : "Could not load organizations.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      requestGeneration.current += 1;
    };
  }, [loadWorkspace]);

  useEffect(() => {
    if (orgId) {
      void refreshProjects(orgId);
    } else {
      setProjects([]);
      setMyRole("viewer");
      setProjectIdState(null);
      setProjectsLoading(false);
    }
  }, [orgId, refreshProjects]);

  const setOrgId = (nextOrgId: string | null) => {
    if (nextOrgId === selectedOrgRef.current) return;
    // Invalidate in-flight requests *before* React processes the state change.
    requestGeneration.current += 1;
    selectedOrgRef.current = nextOrgId;
    allowedProjectsRef.current = new Set();
    setOrgIdState(nextOrgId);
    setProjects([]);
    setMyRole("viewer");
    setProjectIdState(null);
    setProjectsLoading(Boolean(nextOrgId));
    setError("");
    if (getActiveProject()) setActiveProject(null);
  };

  const setProjectId = (nextProjectId: string | null) => {
    if (nextProjectId && (
      projectsLoading ||
      !selectedOrgRef.current ||
      !allowedProjectsRef.current.has(nextProjectId)
    )) {
      return;
    }
    setProjectIdState(nextProjectId);
    if (nextProjectId && selectedOrgRef.current) {
      setActiveProject({
        projectId: nextProjectId,
        organizationId: selectedOrgRef.current,
      });
    } else if (!nextProjectId && getActiveProject()) {
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
    projectsLoading,
    error,
  };
}

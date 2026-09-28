import { describe, expect, it } from "vitest";
import { resolveActiveProjectDetails } from "@/components/kide/useActiveProjectDetails";

const organizations = [
  {
    id: "org-1",
    name: "Aero Systems",
    slug: "aero-systems",
    role: "owner" as const,
    projects: [
      {
        id: "project-1",
        name: "Flight Controls",
        description: null,
        status: "draft",
        current_stage: 3,
        updated_at: "2026-09-28T00:00:00.000Z",
      },
    ],
  },
];

describe("active project details", () => {
  it("resolves the exact selected project without inventing a fallback", () => {
    expect(
      resolveActiveProjectDetails(organizations, {
        organizationId: "org-1",
        projectId: "project-1",
      }),
    ).toEqual({
      organizationId: "org-1",
      organizationName: "Aero Systems",
      projectId: "project-1",
      projectName: "Flight Controls",
      status: "draft",
      currentStage: 3,
    });
  });

  it("returns null when no active project is selected", () => {
    expect(resolveActiveProjectDetails(organizations, null)).toBeNull();
  });

  it("returns null instead of silently choosing another project", () => {
    expect(
      resolveActiveProjectDetails(organizations, {
        organizationId: "org-1",
        projectId: "missing",
      }),
    ).toBeNull();
  });
});

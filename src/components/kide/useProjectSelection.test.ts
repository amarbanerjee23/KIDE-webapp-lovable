import { describe, expect, it } from "vitest";
import {
  preferredExplicitProjectId,
  type ProjectOption,
} from "@/components/kide/useProjectSelection";

const projects: ProjectOption[] = [
  { id: "p1", name: "Alpha", status: "draft", current_stage: 1 },
  { id: "p2", name: "Beta", status: "draft", current_stage: 2 },
];

describe("explicit project selection", () => {
  it("keeps a valid already-selected project", () => {
    expect(
      preferredExplicitProjectId(projects, { projectId: "p2", organizationId: "org-1" }, "org-1"),
    ).toBe("p2");
  });

  it("does not silently choose the first project when nothing is active", () => {
    expect(preferredExplicitProjectId(projects, null, "org-1")).toBeNull();
  });

  it("does not carry a project across organizations", () => {
    expect(
      preferredExplicitProjectId(
        projects,
        { projectId: "p1", organizationId: "org-other" },
        "org-1",
      ),
    ).toBeNull();
  });
});

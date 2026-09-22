import { beforeEach, describe, expect, it, vi } from "vitest";

describe("active project browser state", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it("persists the selected project in browser storage", async () => {
    const state = await import("./active-project");

    state.setActiveProject({
      projectId: "project-1",
      organizationId: "org-1",
    });

    expect(state.getActiveProject()).toEqual({
      projectId: "project-1",
      organizationId: "org-1",
    });
  });

  it("clears project state completely", async () => {
    const state = await import("./active-project");
    state.setActiveProject({
      projectId: "project-1",
      organizationId: "org-1",
    });

    state.clearActiveProject();

    expect(state.getActiveProject()).toBeNull();
    expect(window.localStorage.getItem("kide:active-project")).toBeNull();
  });
});

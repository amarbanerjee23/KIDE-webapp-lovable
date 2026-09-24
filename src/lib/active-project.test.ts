import { beforeEach, describe, expect, it, vi } from "vitest";

function browserWindow() {
  const values = new Map<string, string>();
  return {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
      clear: () => {
        values.clear();
      },
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
}

describe("active project browser state", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", browserWindow());
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
    expect(window.localStorage.getItem("kide:active-project")).toBe(
      JSON.stringify({
        projectId: "project-1",
        organizationId: "org-1",
      }),
    );
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

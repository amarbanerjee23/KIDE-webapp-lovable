import { beforeEach, describe, expect, it } from "vitest";
import {
  clearWorkspaceAccess,
  getWorkspaceAccess,
  setWorkspaceAccess,
  setWorkspaceAccessLoading,
} from "./workspace-access";

describe("workspace edit access", () => {
  beforeEach(() => {
    clearWorkspaceAccess();
  });

  it("fails closed before project authorization resolves", () => {
    expect(getWorkspaceAccess()).toEqual({
      projectId: null,
      status: "idle",
      canEdit: false,
    });

    setWorkspaceAccessLoading("project-1");

    expect(getWorkspaceAccess()).toEqual({
      projectId: "project-1",
      status: "loading",
      canEdit: false,
    });
  });

  it("publishes authorized edit access for the active project", () => {
    setWorkspaceAccess("project-1", true);

    expect(getWorkspaceAccess()).toEqual({
      projectId: "project-1",
      status: "ready",
      canEdit: true,
    });
  });

  it("preserves read-only authorization", () => {
    setWorkspaceAccess("project-1", false);

    expect(getWorkspaceAccess()).toEqual({
      projectId: "project-1",
      status: "ready",
      canEdit: false,
    });
  });
});

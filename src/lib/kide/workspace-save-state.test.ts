import { beforeEach, describe, expect, it } from "vitest";
import {
  clearWorkspaceSaveState,
  getWorkspaceSaveState,
  setWorkspaceSaveState,
} from "@/lib/kide/workspace-save-state";

describe("workspace save state", () => {
  beforeEach(() => clearWorkspaceSaveState());

  it("starts idle", () => {
    expect(getWorkspaceSaveState()).toEqual({
      projectId: null,
      status: "idle",
      savedAt: null,
      message: null,
    });
  });

  it("records saving and failure state for the active project", () => {
    setWorkspaceSaveState({
      projectId: "project-1",
      status: "saving",
      savedAt: "2026-09-28T10:00:00.000Z",
      message: null,
    });
    expect(getWorkspaceSaveState().status).toBe("saving");

    setWorkspaceSaveState({
      projectId: "project-1",
      status: "error",
      savedAt: "2026-09-28T10:00:00.000Z",
      message: "network unavailable",
    });
    expect(getWorkspaceSaveState()).toMatchObject({
      projectId: "project-1",
      status: "error",
      message: "network unavailable",
    });
  });
});

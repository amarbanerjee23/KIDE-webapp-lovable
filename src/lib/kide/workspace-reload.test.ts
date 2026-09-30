import { describe, expect, it } from "vitest";
import { requestWorkspaceReload } from "@/lib/kide/workspace-reload";

describe("workspace reload trigger", () => {
  it("can be requested repeatedly without throwing", () => {
    expect(() => {
      requestWorkspaceReload();
      requestWorkspaceReload();
    }).not.toThrow();
  });
});

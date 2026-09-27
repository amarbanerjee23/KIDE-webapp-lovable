import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXAMPLE_WORKSPACE_ID,
  EXAMPLE_WORKSPACES,
  getExampleWorkspace,
  linkWorkspace,
} from "@/lib/dsl";

describe("KIDE reference example library", () => {
  it("contains ten diverse, uniquely identified examples", () => {
    expect(EXAMPLE_WORKSPACES).toHaveLength(10);
    expect(new Set(EXAMPLE_WORKSPACES.map((example) => example.id)).size).toBe(10);
    expect(new Set(EXAMPLE_WORKSPACES.map((example) => example.domain)).size).toBe(10);
  });

  it.each(EXAMPLE_WORKSPACES.map((example) => [example.id, example] as const))(
    "%s contains all five linked KIDE model languages",
    (_id, example) => {
      expect(example.files).toHaveLength(5);
      expect(new Set(example.files.map((file) => file.kind))).toEqual(
        new Set(["dml", "op", "mncspec", "cap", "activity"]),
      );

      const workspace = linkWorkspace(example.files);
      expect(workspace.errorCount).toBe(0);
      expect(workspace.files.every((file) => file.result.ast)).toBe(true);
    },
  );

  it("keeps the historical warehouse example as the default", () => {
    expect(DEFAULT_EXAMPLE_WORKSPACE_ID).toBe("warehouse-fleet");
    expect(getExampleWorkspace(DEFAULT_EXAMPLE_WORKSPACE_ID).title).toBe(
      "Autonomous warehouse fleet",
    );
  });

  it("rejects unknown example identifiers", () => {
    expect(() => getExampleWorkspace("does-not-exist")).toThrow("Unknown KIDE example workspace");
  });
});

import { describe, expect, it } from "vitest";
import {
  assertWorkspacePathAvailable,
  normalizeWorkspaceFilePath,
  starterSourceForKind,
} from "./workspace-files";

describe("browser workspace file lifecycle", () => {
  it("normalizes nested model paths and appends the selected extension", () => {
    expect(normalizeWorkspaceFilePath(" controls/main ", "mncspec")).toBe(
      "controls/main.mncspec",
    );
  });

  it("rejects traversal, unsupported characters and language-extension mismatches", () => {
    expect(() => normalizeWorkspaceFilePath("../secret", "dml")).toThrow("invalid segment");
    expect(() => normalizeWorkspaceFilePath("bad name", "dml")).toThrow("letters, numbers");
    expect(() => normalizeWorkspaceFilePath("model.cap", "dml")).toThrow("does not match");
  });

  it("detects duplicate paths case-insensitively", () => {
    expect(() =>
      assertWorkspacePathAvailable({ "models/Plant.dml": "" }, "models/plant.dml"),
    ).toThrow("already exists");
  });

  it("allows a rename to keep the same path", () => {
    expect(() =>
      assertWorkspacePathAvailable(
        { "models/Plant.dml": "" },
        "models/Plant.dml",
        "models/Plant.dml",
      ),
    ).not.toThrow();
  });

  it("creates deterministic starter source for each DSL kind", () => {
    expect(starterSourceForKind("dml", "plant.dml")).toContain("DataModel Plant");
    expect(starterSourceForKind("op", "estimate-arrival.op")).toContain(
      "Operation EstimateArrival",
    );
    expect(starterSourceForKind("mncspec", "plant.mncspec")).toContain("Model Plant");
    expect(starterSourceForKind("cap", "navigate.cap")).toContain("Capability Navigate");
    expect(starterSourceForKind("activity", "mission.activity")).toContain(
      "ActivityDiagram Mission",
    );
  });
});

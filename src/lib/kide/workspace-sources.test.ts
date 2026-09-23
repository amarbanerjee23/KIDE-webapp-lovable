import { describe, expect, it } from "vitest";
import { SAMPLE_WORKSPACE } from "@/lib/dsl";
import {
  emptyWorkspaceSources,
  exampleWorkspaceSources,
  linkSources,
  workspaceFilesFromSources,
} from "./workspace-sources";

describe("workspace source serialization", () => {
  it("starts empty and does not fabricate project files", () => {
    const sources = emptyWorkspaceSources();

    expect(workspaceFilesFromSources(sources)).toEqual([]);
    expect(linkSources(sources).files).toEqual([]);
  });

  it("round-trips the explicit example workspace without changing source text", () => {
    const sources = exampleWorkspaceSources();
    const files = workspaceFilesFromSources(sources);

    expect(files).toEqual([...SAMPLE_WORKSPACE].sort((a, b) => a.path.localeCompare(b.path)));
    expect(linkSources(sources).errorCount).toBe(0);
  });

  it("derives file kinds from persisted paths instead of the demo manifest", () => {
    const sources = {
      "custom/plant.mncspec": "Model Plant",
      "custom/mission.activity": "ActivityDiagram Mission has activities { }",
      "notes.txt": "not a KIDE model",
    };

    expect(workspaceFilesFromSources(sources).map(({ path, kind }) => ({ path, kind }))).toEqual([
      { path: "custom/mission.activity", kind: "activity" },
      { path: "custom/plant.mncspec", kind: "mncspec" },
    ]);
  });
});

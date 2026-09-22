import { describe, expect, it } from "vitest";
import { SAMPLE_WORKSPACE } from "@/lib/dsl";
import {
  initialWorkspaceSources,
  linkSources,
  workspaceFilesFromSources,
} from "./workspace-sources";

describe("workspace source serialization", () => {
  it("round-trips the reference workspace without changing source text", () => {
    const sources = initialWorkspaceSources();
    const files = workspaceFilesFromSources(sources);

    expect(files).toEqual(SAMPLE_WORKSPACE);
    expect(linkSources(sources).errorCount).toBe(0);
  });
});

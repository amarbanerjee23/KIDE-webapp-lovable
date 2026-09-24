import { describe, expect, it } from "vitest";
import { linkWorkspace } from "./index";
import { SAMPLE_WORKSPACE } from "./samples";
import {
  buildWorkspaceLanguageIndex,
  findDefinitions,
  findReferences,
} from "./workspace-language-service";

const workspace = linkWorkspace(SAMPLE_WORKSPACE);
const index = buildWorkspaceLanguageIndex(workspace);

function referenceOffset(path: string, name: string): number {
  const file = workspace.files.find((entry) => entry.path === path);
  if (!file) throw new Error(`Missing workspace file ${path}`);

  const reference = file.result.references.find(
    (entry) => entry.name === name || entry.name.endsWith(`.${name}`),
  );
  if (!reference) throw new Error(`Missing reference ${name} in ${path}`);

  return reference.offset;
}

describe("workspace language service", () => {
  it("indexes declarations across all five DSLs", () => {
    expect(
      index.definitions.some((entry) => entry.kind === "dataModel" && entry.name === "Telemetry"),
    ).toBe(true);
    expect(
      index.definitions.some(
        (entry) => entry.kind === "operation" && entry.name === "EstimateArrival",
      ),
    ).toBe(true);
    expect(
      index.definitions.some((entry) => entry.kind === "interface" && entry.name === "Vehicle"),
    ).toBe(true);
    expect(
      index.definitions.some((entry) => entry.kind === "capability" && entry.name === "Navigate"),
    ).toBe(true);
    expect(
      index.definitions.some((entry) => entry.kind === "activity" && entry.name === "PlanRoute"),
    ).toBe(true);
  });

  it("resolves a capability reference to its declaration", () => {
    const offset = referenceOffset("MissionPlanning.activity", "Navigate");
    const definitions = findDefinitions(index, "MissionPlanning.activity", offset);

    expect(definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "capability",
          name: "Navigate",
          path: "Ecre.cap",
        }),
      ]),
    );
  });

  it("resolves interface-item aliases to concrete command declarations", () => {
    const offset = referenceOffset("MissionPlanning.activity", "MoveTo");
    const definitions = findDefinitions(index, "MissionPlanning.activity", offset);

    expect(definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "MoveTo",
          path: "Ecre.mncspec",
        }),
      ]),
    );
  });

  it("finds cross-file references for an operation", () => {
    const offset = referenceOffset("MissionPlanning.activity", "EstimateArrival");
    const references = findReferences(index, "MissionPlanning.activity", offset, true);

    expect(references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          declaration: true,
          kind: "operation",
          name: "EstimateArrival",
          path: "Ecre.op",
        }),
        expect.objectContaining({
          declaration: false,
          kind: "operation",
          name: "EstimateArrival",
          path: "MissionPlanning.activity",
        }),
      ]),
    );
  });

  it("returns no navigation target outside a symbol range", () => {
    expect(findDefinitions(index, "Ecre.dml", 0)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { linkWorkspace } from "@/lib/dsl";
import { SAMPLE_WORKSPACE } from "@/lib/dsl/samples";
import type { KnowledgeNodeKind, KnowledgeProjection } from "@/lib/knowledge/contracts";
import { projectWorkspaceToKnowledgeGraph } from "@/lib/knowledge/project-graph";
import { summarizeKnowledgeGraph } from "@/lib/knowledge/summary";
import { validateKnowledgeProjection } from "@/lib/knowledge/validation";

const GENERATED_AT = "2026-09-24T00:00:00.000Z";

function sampleProjection() {
  return projectWorkspaceToKnowledgeGraph(
    "project-knowledge-test",
    linkWorkspace(SAMPLE_WORKSPACE),
    GENERATED_AT,
  );
}

describe("project knowledge projection", () => {
  it("projects all five KIDE model families into one deterministic semantic graph", () => {
    const first = sampleProjection();
    const second = sampleProjection();

    expect(first).toEqual(second);
    expect(first.ontologyIri).toBe("https://kide.dev/ontology/capability");
    expect(first.scope).toBe("project");
    expect(first.nodes.length).toBeGreaterThan(20);
    expect(first.edges.length).toBeGreaterThan(20);
    expect(first.diagnostics.filter((item) => item.severity === "error")).toEqual([]);

    const kinds = new Set(first.nodes.map((node) => node.kind));
    const expectedKinds: KnowledgeNodeKind[] = [
      "Project",
      "DataModel",
      "Operation",
      "ControlModel",
      "Interface",
      "Capability",
      "Behavior",
      "Workflow",
      "Activity",
    ];
    for (const kind of expectedKinds) {
      expect(kinds.has(kind)).toBe(true);
    }
  });

  it("binds activity requirements to capabilities and capability contracts to interfaces", () => {
    const projection = sampleProjection();
    const navigate = projection.nodes.find(
      (node) => node.kind === "Capability" && node.label === "Navigate",
    );
    const move = projection.nodes.find(
      (node) => node.kind === "Activity" && node.label === "MoveToWaypoint",
    );
    const vehicle = projection.nodes.find(
      (node) => node.kind === "Interface" && node.label === "Vehicle",
    );

    expect(navigate).toBeDefined();
    expect(move).toBeDefined();
    expect(vehicle).toBeDefined();

    expect(
      projection.edges.some(
        (edge) =>
          edge.kind === "requiredCapability" && edge.from === move?.id && edge.to === navigate?.id,
      ),
    ).toBe(true);

    expect(
      projection.edges.some(
        (edge) =>
          edge.kind === "hasInterface" && edge.from === navigate?.id && edge.to === vehicle?.id,
      ),
    ).toBe(true);

    expect(
      projection.edges.some((edge) => edge.kind === "hasBehavior" && edge.from === navigate?.id),
    ).toBe(true);

    expect(
      projection.edges.some((edge) => edge.kind === "hasContext" && edge.from === navigate?.id),
    ).toBe(true);
  });

  it("binds data and control models into the same project overlay", () => {
    const projection = sampleProjection();
    const root = projection.nodes.find((node) => node.kind === "Project");
    const missionContext = projection.nodes.find(
      (node) => node.kind === "DataModel" && node.label === "MissionContext",
    );
    const controlModel = projection.nodes.find(
      (node) => node.kind === "ControlModel" && node.label === "EcreFleet",
    );
    const workflow = projection.nodes.find(
      (node) => node.kind === "Workflow" && node.label === "MissionPlanning",
    );

    expect(
      projection.edges.some(
        (edge) =>
          edge.kind === "containsDataModel" &&
          edge.from === root?.id &&
          edge.to === missionContext?.id,
      ),
    ).toBe(true);
    expect(
      projection.edges.some(
        (edge) =>
          edge.kind === "containsControlModel" &&
          edge.from === root?.id &&
          edge.to === controlModel?.id,
      ),
    ).toBe(true);
    expect(
      projection.edges.some(
        (edge) =>
          edge.kind === "usesDataModel" &&
          edge.from === workflow?.id &&
          edge.to === missionContext?.id,
      ),
    ).toBe(true);
  });

  it("keeps same-named nested device entities distinct by parent semantic identity", () => {
    const workspace = linkWorkspace([
      {
        path: "DuplicateNames.mncspec",
        kind: "mncspec",
        source: `Model DuplicateNames

InterfaceDescription DeviceA {
  commands { Start[] }
}

InterfaceDescription DeviceB {
  commands { Start[] }
}
`,
      },
    ]);

    const projection = projectWorkspaceToKnowledgeGraph(
      "project-identity-test",
      workspace,
      GENERATED_AT,
    );

    const commands = projection.nodes.filter(
      (node) => node.kind === "Command" && node.label === "Start",
    );
    expect(commands).toHaveLength(2);
    expect(new Set(commands.map((node) => node.id)).size).toBe(2);
    expect(commands.map((node) => node.properties.interface).sort()).toEqual([
      "DeviceA",
      "DeviceB",
    ]);
  });

  it("summarizes graph content for the web catalogue", () => {
    const summary = summarizeKnowledgeGraph(sampleProjection());
    expect(summary.nodeCount).toBeGreaterThan(0);
    expect(summary.edgeCount).toBeGreaterThan(0);
    expect(summary.byKind.Capability).toBe(2);
    expect(summary.byKind.Interface).toBe(1);
    expect(summary.byKind.Workflow).toBe(1);
    expect(summary.errorCount).toBe(0);
  });
});

describe("semantic graph validation", () => {
  it("fails closed for dangling edges and project-scope violations", () => {
    const projection: KnowledgeProjection = {
      schemaVersion: 1,
      ontologyIri: "https://kide.dev/ontology/capability",
      scope: "project",
      projectId: "p1",
      generatedAt: GENERATED_AT,
      nodes: [
        {
          id: "urn:kide:project:p1",
          kind: "Project",
          label: "p1",
          scope: "project",
          projectId: "other-project",
          properties: {},
        },
      ],
      edges: [
        {
          id: "edge-1",
          kind: "containsCapability",
          from: "urn:kide:project:p1",
          to: "missing",
          scope: "project",
          projectId: "p1",
          properties: {},
        },
      ],
      diagnostics: [],
    };

    const diagnostics = validateKnowledgeProjection(projection);
    expect(diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["KG_PROJECT_SCOPE_VIOLATION", "KG_DANGLING_EDGE"]),
    );
  });

  it("enforces Interface and Behavior as mandatory parts of a capability contract", () => {
    const projection: KnowledgeProjection = {
      schemaVersion: 1,
      ontologyIri: "https://kide.dev/ontology/capability",
      scope: "project",
      projectId: "p1",
      generatedAt: GENERATED_AT,
      nodes: [
        {
          id: "capability",
          kind: "Capability",
          label: "PickAndPlace",
          scope: "project",
          projectId: "p1",
          properties: {},
        },
      ],
      edges: [],
      diagnostics: [],
    };

    const diagnostics = validateKnowledgeProjection(projection);
    expect(diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "KG_CAPABILITY_INTERFACE_REQUIRED",
        "KG_CAPABILITY_BEHAVIOR_REQUIRED",
      ]),
    );
  });
});

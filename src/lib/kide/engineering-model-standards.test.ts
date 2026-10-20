/* eslint-disable prettier/prettier -- Standards conformance fixtures retain explicit relation and identifier checks. */
import { describe, expect, it } from "vitest";
import { EXAMPLE_WORKSPACES } from "@/lib/dsl";
import { graphForFile } from "./engineering-diagrams";
import { projectEngineeringGraphToStandards } from "./engineering-model-standards";
import { exampleWorkspaceSources, linkSources } from "./workspace-sources";

describe("UML XMI and SysML v2 model interoperability", () => {
  it.each(EXAMPLE_WORKSPACES.map((example) => [example.id] as const))(
    "maps all declared elements and relationships for %s",
    (id) => {
      const workspace = linkSources(exampleWorkspaceSources(id));
      expect(workspace.errorCount).toBe(0);

      for (const file of workspace.files) {
        const graph = graphForFile(file);
        const { umlXmi, sysmlV2, trace } = projectEngineeringGraphToStandards(graph);
        expect(trace.elements).toHaveLength(graph.nodes.length);
        expect(trace.relationships).toHaveLength(graph.edges.length);
        expect(trace.fidelity).toBe("structural-trace-projection");
        expect(umlXmi).toContain("<xmi:XMI ");
        expect(umlXmi).toContain("<uml:Model ");
        expect(umlXmi).toContain("<packagedElement ");
        expect(umlXmi).toContain("</xmi:XMI>");
        expect(sysmlV2).toContain("package KIDE_");

        const ids = new Set(trace.elements.map((element) => element.umlId));
        const names = new Set(trace.elements.map((element) => element.sysmlName));
        expect(ids.size).toBe(graph.nodes.length);
        expect(names.size).toBe(graph.nodes.length);
        for (const element of trace.elements) {
          expect(umlXmi).toContain(`xmi:id="${element.umlId}"`);
          expect(sysmlV2).toContain(`def ${element.sysmlName};`);
        }
        for (const rel of trace.relationships) {
          expect(umlXmi).toContain(`xmi:id="${rel.umlId}"`);
          const source = trace.elements.find((element) => element.sourceId === rel.source)!;
          const target = trace.elements.find((element) => element.sourceId === rel.target)!;
          expect(sysmlV2).toContain(
            `dependency ${source.sysmlName} to ${target.sysmlName};`,
          );
          expect(umlXmi).toContain(`client="${source.umlId}" supplier="${target.umlId}"`);
        }
      }
    },
  );

  it("preserves exact quoted labels through XMI escaping and the trace mapping", () => {
    const graph = {
      title: 'Controller <A & B> "quoted"',
      subtitle: "example",
      nodes: [
        { id: "a", label: 'Input <script> & "test"', kind: "signal" as const, lane: 0 as const, description: "" },
        { id: "b", label: "Motor's command", kind: "device" as const, lane: 1 as const, description: "Do not inject & <tags>" },
      ],
      edges: [{ from: "a", to: "b", label: 'requires & "control"' }],
    };
    const result = projectEngineeringGraphToStandards(graph);
    expect(result.umlXmi).toContain("&lt;script&gt;");
    expect(result.umlXmi).toContain("&amp; &quot;test&quot;");
    expect(result.umlXmi).not.toContain("<script>");
    expect(result.sysmlV2).not.toContain("<script>");
    expect(result.sysmlV2).not.toContain("Motor's command");
    expect(result.trace.elements[0]!.label).toBe(graph.nodes[0]!.label);
    expect(result.trace.elements[1]!.description).toBe(graph.nodes[1]!.description);
    expect(result.trace.relationships[0]!.label).toBe(graph.edges[0]!.label);
    expect(projectEngineeringGraphToStandards(graph)).toEqual(result);
  });

  it("rejects dangling edges and duplicate graph node IDs", () => {
    const empty = {
      title: "Failure case",
      subtitle: "",
      nodes: [{ id: "n0", label: "Sensor", description: "", lane: 0 as const, kind: "device" as const }],
      edges: [{ from: "n0", to: "missing", label: "uses" }],
    };
    expect(() => projectEngineeringGraphToStandards(empty)).toThrow("dangling relationships");
    const repeated = { ...empty, nodes: [...empty.nodes, empty.nodes[0]!], edges: [] };
    expect(() => projectEngineeringGraphToStandards(repeated)).toThrow("duplicate source");
  });
});

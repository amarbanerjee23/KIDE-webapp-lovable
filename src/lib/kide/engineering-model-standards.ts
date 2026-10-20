/* eslint-disable prettier/prettier -- Interchange XML and SysML snippets retain explicit mapping and source ordering. */
import type { Graph } from "./engineering-diagrams";
import { sha256 } from "./sha256";

/**
 * A traceable, intentionally conservative projection into standard modelling
 * languages. UML XMI expresses typed model elements and trace dependencies;
 * SysML v2 expresses definitions and dependencies. The original KIDE AST and
 * all diagram renderings are retained alongside both projections.
 *
 * These interchange files are not a claim of complete semantic equivalence
 * to KIDE's executable control, validation, timing or safety semantics.
 */
const XMI_NS = "http://www.omg.org/spec/XMI/20131001";
const UML_NS = "http://www.omg.org/spec/UML/20161101";

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function identifier(value: string, prefix: string): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 46);
  return `${prefix}_${cleaned || "Unnamed"}`;
}

type ProjectedNode = {
  sourceId: string;
  label: string;
  description: string;
  umlId: string;
  sysmlName: string;
  umlType: string;
  sysmlType: string;
};

export type StandardModelTrace = {
  format: "kide.standard-model-trace/1";
  sourceDiagram: string;
  fidelity: "structural-trace-projection";
  elements: ProjectedNode[];
  relationships: Array<{
    source: string;
    target: string;
    label: string;
    umlId: string;
  }>;
};

export type StandardModelProjection = {
  umlXmi: string;
  sysmlV2: string;
  trace: StandardModelTrace;
};

function mapping(kind: Graph["nodes"][number]["kind"]): [string, string] {
  switch (kind) {
    case "root":
      return ["uml:Class", "part"];
    case "data":
      return ["uml:Class", "item"];
    case "operation":
    case "activity":
      return ["uml:Activity", "action"];
    case "device":
      return ["uml:Component", "part"];
    case "capability":
      return ["uml:Class", "part"];
    case "signal":
      return ["uml:Class", "item"];
  }
}

/**
 * Exports one already parsed KIDE diagram as a semantic UML model (XMI 2.5.1),
 * a SysML v2.0 textual model and an element-level mapping sidecar.
 *
 * XML IDs and SysML identifiers are deterministic and independent of node
 * labels containing quotes, whitespace or characters unsafe in source code.
 */
export function projectEngineeringGraphToStandards(graph: Graph): StandardModelProjection {
  const scope = sha256(graph.title).slice(0, 12);
  const nodes: ProjectedNode[] = graph.nodes.map((node, index) => {
    const [umlType, sysmlKind] = mapping(node.kind);
    return {
      sourceId: node.id,
      label: node.label,
      description: node.description,
      umlId: `element_${scope}_${index}`,
      sysmlName: `${identifier(node.label, "KIDE")}_${index}`,
      umlType,
      sysmlType: sysmlKind,
    };
  });

  const lookup = new Map(nodes.map((node) => [node.sourceId, node]));
  if (lookup.size !== graph.nodes.length) {
    throw new Error("Cannot export standard models with duplicate source element IDs.");
  }
  const relationships = graph.edges.map((edge, index) => {
    if (!lookup.has(edge.from) || !lookup.has(edge.to)) {
      throw new Error("Cannot export standard models with dangling relationships.");
    }
    return {
      source: edge.from,
      target: edge.to,
      label: edge.label,
      umlId: `relationship_${scope}_${index}`,
    };
  });

  const elementLines = nodes.map((node) => {
    // Exact original labels are preserved in UML; SysML uses deterministic,
    // lexical-safe identifiers with a lossless label mapping in trace.json.
    const comment = node.description
      ? `<ownedComment xmi:type="uml:Comment" xmi:id="${node.umlId}_comment" body="${xml(node.description)}" annotatedElement="${node.umlId}"/>`
      : "";
    return `    <packagedElement xmi:type="${node.umlType}" xmi:id="${node.umlId}" name="${xml(node.label)}">${comment}</packagedElement>`;
  });

  const relationLines = relationships.map((rel) => {
    const client = lookup.get(rel.source)!;
    const supplier = lookup.get(rel.target)!;
    // KIDE links can have more nuanced semantics than a UML dependency.
    // Preserve their original role in the relationship name and trace sidecar.
    return `    <packagedElement xmi:type="uml:Dependency" xmi:id="${rel.umlId}" name="${xml(rel.label)}" client="${client.umlId}" supplier="${supplier.umlId}"/>`;
  });

  const modelId = `model_${scope}`;
  const umlXmi = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<xmi:XMI xmlns:xmi="${XMI_NS}" xmlns:uml="${UML_NS}" xmi:version="2.5.1">`,
    `  <uml:Model xmi:id="${modelId}" name="${xml(graph.title)}">`,
    `  <packagedElement xmi:type="uml:Package" xmi:id="package_${scope}" name="KIDE">`,
    ...elementLines,
    ...relationLines,
    "  </packagedElement>",
    "  </uml:Model>",
    "</xmi:XMI>",
    "",
  ].join("\n");

  const packageName = identifier(graph.title, "KIDE");
  const declarations = nodes.map((node) =>
    `  ${node.sysmlType} def ${node.sysmlName};`,
  );
  const dependencies = relationships.map((rel) =>
    `  dependency ${lookup.get(rel.source)!.sysmlName} to ${lookup.get(rel.target)!.sysmlName};`,
  );
  const sysmlV2 = [
    "// SysML v2.0 textual notation: KIDE structural/traceability projection",
    "// Original KIDE labels, element IDs and relationship roles: see trace.json",
    "// This file does not encode all behavioral, timing or safety semantics.",
    `package ${packageName} {`,
    ...declarations,
    ...dependencies,
    "}",
    "",
  ].join("\n");

  return {
    umlXmi,
    sysmlV2,
    trace: {
      format: "kide.standard-model-trace/1",
      sourceDiagram: graph.title,
      fidelity: "structural-trace-projection",
      elements: nodes,
      relationships,
    },
  };
}

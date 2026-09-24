import type {
  KnowledgeDiagnostic,
  KnowledgeEdgeKind,
  KnowledgeProjection,
} from "@/lib/knowledge/contracts";

function edgesFrom(projection: KnowledgeProjection, id: string, kind: KnowledgeEdgeKind) {
  return projection.edges.filter((edge) => edge.from === id && edge.kind === kind);
}

export function validateKnowledgeProjection(
  projection: KnowledgeProjection,
): KnowledgeDiagnostic[] {
  const diagnostics: KnowledgeDiagnostic[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  for (const node of projection.nodes) {
    if (nodeIds.has(node.id)) {
      diagnostics.push({
        severity: "error",
        code: "KG_DUPLICATE_NODE",
        message: `Duplicate semantic node id '${node.id}'.`,
        entityId: node.id,
        sourcePath: node.sourcePath,
      });
    }
    nodeIds.add(node.id);

    if (node.scope !== "project" || node.projectId !== projection.projectId) {
      diagnostics.push({
        severity: "error",
        code: "KG_PROJECT_SCOPE_VIOLATION",
        message:
          "Project projections may only contain entities owned by the active project overlay.",
        entityId: node.id,
        sourcePath: node.sourcePath,
      });
    }
  }

  for (const edge of projection.edges) {
    if (edgeIds.has(edge.id)) {
      diagnostics.push({
        severity: "error",
        code: "KG_DUPLICATE_EDGE",
        message: `Duplicate semantic edge id '${edge.id}'.`,
        entityId: edge.id,
      });
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      diagnostics.push({
        severity: "error",
        code: "KG_DANGLING_EDGE",
        message: `Semantic edge '${edge.kind}' has a missing endpoint.`,
        entityId: edge.id,
      });
    }

    if (edge.scope !== "project" || edge.projectId !== projection.projectId) {
      diagnostics.push({
        severity: "error",
        code: "KG_EDGE_SCOPE_VIOLATION",
        message: "Project graph edges may not escape the active project overlay.",
        entityId: edge.id,
      });
    }
  }

  for (const node of projection.nodes) {
    if (node.kind !== "Capability") continue;

    if (edgesFrom(projection, node.id, "hasInterface").length === 0) {
      diagnostics.push({
        severity: "error",
        code: "KG_CAPABILITY_INTERFACE_REQUIRED",
        message: `Capability '${node.label}' does not bind an interface.`,
        entityId: node.id,
        sourcePath: node.sourcePath,
      });
    }

    if (edgesFrom(projection, node.id, "hasBehavior").length === 0) {
      diagnostics.push({
        severity: "error",
        code: "KG_CAPABILITY_BEHAVIOR_REQUIRED",
        message: `Capability '${node.label}' does not expose a behavior.`,
        entityId: node.id,
        sourcePath: node.sourcePath,
      });
    }

    if (edgesFrom(projection, node.id, "hasContext").length === 0) {
      diagnostics.push({
        severity: "info",
        code: "KG_CAPABILITY_CONTEXT_UNBOUND",
        message: `Capability '${node.label}' is not yet scoped by a workflow/activity context.`,
        entityId: node.id,
        sourcePath: node.sourcePath,
      });
    }

    if (edgesFrom(projection, node.id, "hasPrecondition").length === 0) {
      diagnostics.push({
        severity: "info",
        code: "KG_CAPABILITY_PRECONDITION_UNDECLARED",
        message: `Capability '${node.label}' has no explicit initialization/precondition contract.`,
        entityId: node.id,
        sourcePath: node.sourcePath,
      });
    }

    if (edgesFrom(projection, node.id, "hasPostcondition").length === 0) {
      diagnostics.push({
        severity: "warning",
        code: "KG_CAPABILITY_POSTCONDITION_UNDECLARED",
        message: `Capability '${node.label}' has no declared outcome/postcondition contract.`,
        entityId: node.id,
        sourcePath: node.sourcePath,
      });
    }
  }

  return diagnostics;
}

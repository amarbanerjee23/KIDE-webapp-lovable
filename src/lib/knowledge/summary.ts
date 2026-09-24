import type { KnowledgeGraphSummary, KnowledgeProjection } from "@/lib/knowledge/contracts";

export function summarizeKnowledgeGraph(projection: KnowledgeProjection): KnowledgeGraphSummary {
  const byKind: KnowledgeGraphSummary["byKind"] = {};
  for (const node of projection.nodes) {
    byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
  }

  return {
    nodeCount: projection.nodes.length,
    edgeCount: projection.edges.length,
    errorCount: projection.diagnostics.filter((item) => item.severity === "error").length,
    warningCount: projection.diagnostics.filter((item) => item.severity === "warning").length,
    byKind,
  };
}

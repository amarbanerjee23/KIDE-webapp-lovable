import { createServerFn } from "@tanstack/react-start";
import { requireKideAuth } from "@/lib/auth-middleware";
import { EDIT_ROLES, requireProjectAccess } from "@/lib/data-access.server";
import type { KnowledgeProjection } from "@/lib/knowledge/contracts";
import {
  knowledgeGraphStatus,
  pingKnowledgeGraph,
  replaceProjectKnowledgeProjection,
} from "@/lib/knowledge/knowledge-graph.server";

function validateProjectionEnvelope(input: KnowledgeProjection): KnowledgeProjection {
  if (!input || input.schemaVersion !== 1 || input.scope !== "project") {
    throw new Error("Unsupported knowledge projection.");
  }
  if (!input.projectId || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    throw new Error("Malformed knowledge projection.");
  }
  if (input.nodes.length === 0 || input.nodes.length > 100_000 || input.edges.length > 500_000) {
    throw new Error("Project knowledge projection exceeds the PR27 safety envelope.");
  }

  const nodeIds = new Set<string>();
  for (const node of input.nodes) {
    if (!node.id || nodeIds.has(node.id)) {
      throw new Error("Knowledge projection contains a duplicate or empty node ID.");
    }
    nodeIds.add(node.id);
  }

  const edgeIds = new Set<string>();
  for (const edge of input.edges) {
    if (!edge.id || edgeIds.has(edge.id)) {
      throw new Error("Knowledge projection contains a duplicate or empty edge ID.");
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new Error("Knowledge projection contains a dangling relationship.");
    }
  }

  return input;
}

export const getKnowledgeGraphStatus = createServerFn({ method: "GET" })
  .middleware([requireKideAuth])
  .handler(async () => {
    const status = knowledgeGraphStatus();
    return {
      ...status,
      reachable: status.configured ? await pingKnowledgeGraph() : false,
    };
  });

export const publishProjectKnowledgeGraph = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator(validateProjectionEnvelope)
  .handler(async ({ data, context }) => {
    const projectRoots = data.nodes.filter(
      (node) => node.kind === "Project" && node.id.startsWith("urn:kide:project:"),
    );
    if (
      projectRoots.length !== 1 ||
      projectRoots[0]?.projectId !== data.projectId ||
      projectRoots[0]?.label !== data.projectId
    ) {
      throw new Error("Project knowledge projection identity is inconsistent.");
    }

    await requireProjectAccess(context.db, context.userId, data.projectId, EDIT_ROLES);

    for (const node of data.nodes) {
      if (node.scope !== "project" || node.projectId !== data.projectId) {
        throw new Error("Knowledge graph project isolation violation.");
      }
    }
    for (const edge of data.edges) {
      if (edge.scope !== "project" || edge.projectId !== data.projectId) {
        throw new Error("Knowledge graph project isolation violation.");
      }
    }

    const result = await replaceProjectKnowledgeProjection(data);
    return { ok: true as const, ...result };
  });

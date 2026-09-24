import type { KnowledgeGraphStatus, KnowledgeProjection } from "@/lib/knowledge/contracts";

const DEFAULT_TIMEOUT_MS = 15_000;

function configuredEndpoint(): string | null {
  const value = process.env["KIDE_KNOWLEDGE_GRAPH_URL"]?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

export function knowledgeGraphStatus(): KnowledgeGraphStatus {
  const endpoint = configuredEndpoint();
  return {
    configured: Boolean(endpoint),
    backend: "janusgraph",
    endpoint,
  };
}

async function gremlin<T>(script: string, bindings: Record<string, unknown>): Promise<T> {
  const endpoint = configuredEndpoint();
  if (!endpoint) {
    throw new Error(
      "Knowledge graph is not configured. Set KIDE_KNOWLEDGE_GRAPH_URL to the JanusGraph HTTP endpoint.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gremlin: script, bindings }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as {
      result?: { data?: T };
      message?: string;
    } | null;

    if (!response.ok) {
      throw new Error(
        payload?.message ?? `JanusGraph request failed with HTTP ${response.status}.`,
      );
    }

    return payload?.result?.data as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function replaceProjectKnowledgeProjection(
  projection: KnowledgeProjection,
): Promise<{ nodeCount: number; edgeCount: number }> {
  const nodes = projection.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    label: node.label,
    scope: node.scope,
    projectId: node.projectId ?? projection.projectId,
    sourcePath: node.sourcePath ?? "",
    propertiesJson: JSON.stringify(node.properties),
  }));
  const edges = projection.edges.map((edge) => ({
    id: edge.id,
    kind: edge.kind,
    from: edge.from,
    to: edge.to,
    scope: edge.scope,
    projectId: edge.projectId ?? projection.projectId,
    propertiesJson: JSON.stringify(edge.properties),
  }));

  const script = `
    g.V().has('scope', 'project').has('projectId', projectId).drop().iterate()

    nodes.each { n ->
      g.addV('KideEntity')
        .property('semanticId', n.id)
        .property('kind', n.kind)
        .property('displayName', n.label)
        .property('scope', n.scope)
        .property('projectId', n.projectId)
        .property('sourcePath', n.sourcePath)
        .property('propertiesJson', n.propertiesJson)
        .iterate()
    }

    edges.each { e ->
      g.V().has('semanticId', e.from).as('source')
        .V().has('semanticId', e.to)
        .addE('semanticRelation').from('source')
        .property('semanticId', e.id)
        .property('kind', e.kind)
        .property('scope', e.scope)
        .property('projectId', e.projectId)
        .property('propertiesJson', e.propertiesJson)
        .iterate()
    }

    [nodeCount: nodes.size(), edgeCount: edges.size()]
  `;

  await gremlin(script, {
    projectId: projection.projectId,
    nodes,
    edges,
  });

  return { nodeCount: nodes.length, edgeCount: edges.length };
}

export async function pingKnowledgeGraph(): Promise<boolean> {
  if (!configuredEndpoint()) return false;
  try {
    const result = await gremlin<number[]>("g.V().limit(1).count()", {});
    return Array.isArray(result);
  } catch {
    return false;
  }
}

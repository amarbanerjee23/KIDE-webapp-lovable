import type {
  GlobalDeviceCandidate,
  GlobalKnowledgeSnapshot,
  KnowledgeGraphStatus,
  KnowledgeProjection,
} from "@/lib/knowledge/contracts";

const DEFAULT_TIMEOUT_MS = 15_000;

function configuredEndpoint(): string | null {
  const value = process.env["KIDE_KNOWLEDGE_GRAPH_URL"]?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

export function unwrapGraphson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unwrapGraphson);
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  if ("@type" in record && "@value" in record) {
    const type = String(record["@type"]);
    const raw = record["@value"];

    if (type.endsWith(":Map") && Array.isArray(raw)) {
      const entries: [string, unknown][] = [];
      for (let index = 0; index < raw.length; index += 2) {
        entries.push([
          String(unwrapGraphson(raw[index])),
          unwrapGraphson(raw[index + 1]),
        ]);
      }
      return Object.fromEntries(entries);
    }

    return unwrapGraphson(raw);
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, unwrapGraphson(item)]),
  );
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

    return unwrapGraphson(payload?.result?.data) as T;
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

function stringProperty(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberProperty(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function readTrustedGlobalKnowledgeSnapshot(): Promise<GlobalKnowledgeSnapshot> {
  if (!configuredEndpoint()) {
    return { backend: "janusgraph", generatedAt: new Date(0).toISOString(), devices: [] };
  }

  const script = `
    def prop = { v, key ->
      try { v.property(key).isPresent() ? v.value(key) : null } catch (ignored) { null }
    }
    def parseProps = { v ->
      def raw = prop(v, 'propertiesJson')
      if (!raw) return [:]
      try { new groovy.json.JsonSlurper().parseText(raw.toString()) } catch (ignored) { [:] }
    }
    def contractKinds = [
      hasInterface: 'interfaceIds',
      hasBehavior: 'behaviorIds',
      hasContext: 'contextIds',
      hasPrecondition: 'preconditionIds',
      hasPostcondition: 'postconditionIds'
    ]
    def devices = []
    g.V().hasLabel('KideEntity').has('scope', 'global').has('kind', 'Device').toList().each { d ->
      def dp = parseProps(d)
      def confidence = dp.confidence instanceof Number ? dp.confidence.doubleValue() : null
      if (dp.sourceFingerprint && dp.sourceLicense && confidence != null && confidence >= 0.8d) {
        def capabilities = []
        d.edges(org.apache.tinkerpop.gremlin.structure.Direction.OUT, 'semanticRelation').each { edge ->
          if (prop(edge, 'kind') == 'hasCapability') {
            def cap = edge.inVertex()
            if (prop(cap, 'kind') == 'Capability') {
              def contract = [
                semanticId: prop(cap, 'semanticId'),
                label: prop(cap, 'displayName'),
                interfaceIds: [],
                behaviorIds: [],
                contextIds: [],
                preconditionIds: [],
                postconditionIds: []
              ]
              cap.edges(org.apache.tinkerpop.gremlin.structure.Direction.OUT, 'semanticRelation').each { ce ->
                def kind = prop(ce, 'kind')
                def targetKey = contractKinds[kind]
                if (targetKey) {
                  def targetId = prop(ce.inVertex(), 'semanticId')
                  if (targetId) contract[targetKey] << targetId
                }
              }
              contract.interfaceIds.sort()
              contract.behaviorIds.sort()
              contract.contextIds.sort()
              contract.preconditionIds.sort()
              contract.postconditionIds.sort()
              capabilities << contract
            }
          }
        }
        capabilities.sort { a, b -> a.semanticId <=> b.semanticId }
        devices << [
          semanticId: prop(d, 'semanticId'),
          label: prop(d, 'displayName'),
          manufacturer: dp.manufacturer,
          model: dp.model,
          sourceUri: dp['prov:hadPrimarySource'],
          sourceLicense: dp.sourceLicense,
          sourceVersion: dp.sourceVersion,
          retrievedAt: dp['prov:generatedAtTime'],
          confidence: confidence,
          sourceFingerprint: dp.sourceFingerprint,
          capabilities: capabilities
        ]
      }
    }
    devices.sort { a, b -> a.semanticId <=> b.semanticId }
    groovy.json.JsonOutput.toJson(devices)
  `;

  const result = await gremlin<unknown[]>(script, {});
  const raw = Array.isArray(result) ? result[0] : null;
  if (typeof raw !== "string") {
    throw new Error("Knowledge graph returned an invalid global candidate snapshot.");
  }

  const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
  const devices: GlobalDeviceCandidate[] = parsed.map((row) => {
    const confidence = numberProperty(row["confidence"]);
    const sourceUri = stringProperty(row["sourceUri"]);
    const sourceLicense = stringProperty(row["sourceLicense"]);
    const retrievedAt = stringProperty(row["retrievedAt"]);
    const sourceFingerprint = stringProperty(row["sourceFingerprint"]);
    if (confidence === null || !sourceUri || !sourceLicense || !retrievedAt || !sourceFingerprint) {
      throw new Error("Trusted global knowledge is missing required provenance.");
    }

    return {
      semanticId: String(row["semanticId"] ?? ""),
      label: String(row["label"] ?? ""),
      manufacturer: stringProperty(row["manufacturer"]),
      model: stringProperty(row["model"]),
      sourceUri,
      sourceLicense,
      sourceVersion: stringProperty(row["sourceVersion"]),
      retrievedAt,
      confidence,
      sourceFingerprint,
      capabilities: (Array.isArray(row["capabilities"]) ? row["capabilities"] : []).map(
        (capability) => {
          const value = capability as Record<string, unknown>;
          const list = (key: string) =>
            (Array.isArray(value[key]) ? value[key] : []).map(String).sort();
          return {
            semanticId: String(value["semanticId"] ?? ""),
            label: String(value["label"] ?? ""),
            interfaceIds: list("interfaceIds"),
            behaviorIds: list("behaviorIds"),
            contextIds: list("contextIds"),
            preconditionIds: list("preconditionIds"),
            postconditionIds: list("postconditionIds"),
          };
        },
      ),
    };
  });

  return {
    backend: "janusgraph",
    generatedAt: new Date().toISOString(),
    devices,
  };
}

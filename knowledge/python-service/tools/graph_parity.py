from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import httpx

from app.canonical import canonical_snapshot, semantic_fingerprint
from app.models import KnowledgeProjection


def unwrap_graphson(value: Any) -> Any:
    if isinstance(value, list):
        return [unwrap_graphson(item) for item in value]
    if not isinstance(value, dict):
        return value
    if "@value" in value and "@type" in value:
        raw = value["@value"]
        if str(value["@type"]).endswith(":Map") and isinstance(raw, list):
            return {
                str(unwrap_graphson(raw[index])): unwrap_graphson(raw[index + 1])
                for index in range(0, len(raw), 2)
            }
        return unwrap_graphson(raw)
    return {key: unwrap_graphson(item) for key, item in value.items()}


def expected_snapshot(projection: KnowledgeProjection) -> dict[str, Any]:
    nodes = [
        {
            "semanticId": node.id,
            "kind": node.kind,
            "displayName": node.label,
            "properties": node.properties,
        }
        for node in projection.nodes
    ]
    edges = [
        {
            "semanticId": edge.id,
            "kind": edge.kind,
            "from": edge.from_,
            "to": edge.to,
            "properties": edge.properties,
        }
        for edge in projection.edges
    ]
    return canonical_snapshot(nodes, edges)


def janus_request(url: str, script: str, bindings: dict[str, Any]) -> Any:
    response = httpx.post(
        url,
        json={"gremlin": script, "bindings": bindings},
        timeout=30,
    )
    response.raise_for_status()
    payload = unwrap_graphson(response.json())
    data = payload.get("result", {}).get("data", [])
    if isinstance(data, list) and len(data) == 1:
        return data[0]
    return data


def load_into_janus(url: str, projection: KnowledgeProjection) -> None:
    nodes = [
        {
            "id": node.id,
            "kind": node.kind,
            "label": node.label,
            "scope": node.scope,
            "projectId": node.projectId or "",
            "sourcePath": node.sourcePath or "",
            "propertiesJson": json.dumps(
                node.properties, sort_keys=True, separators=(",", ":")
            ),
        }
        for node in projection.nodes
    ]
    edges = [
        {
            "id": edge.id,
            "kind": edge.kind,
            "from": edge.from_,
            "to": edge.to,
            "scope": edge.scope,
            "projectId": edge.projectId or "",
            "propertiesJson": json.dumps(
                edge.properties, sort_keys=True, separators=(",", ":")
            ),
        }
        for edge in projection.edges
    ]
    script = """
      g.V().has('semanticId', within(nodeIds)).drop().iterate()

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
      nodes.size() + edges.size()
    """
    janus_request(
        url,
        script,
        {
            "nodeIds": [node["id"] for node in nodes],
            "nodes": nodes,
            "edges": edges,
        },
    )


def read_janus_snapshot(
    url: str, projection: KnowledgeProjection
) -> dict[str, Any]:
    script = """
      def fixtureNodeIds = nodeIds as Set
      def fixtureEdgeIds = edgeIds as Set
      def ns = g.V().has('semanticId', within(fixtureNodeIds))
        .map {
          def v = it.get()
          [
            semanticId: v.value('semanticId'),
            kind: v.value('kind'),
            displayName: v.value('displayName'),
            propertiesJson: v.value('propertiesJson')
          ]
        }.toList()
      def es = g.E().has('semanticId', within(fixtureEdgeIds))
        .map {
          def e = it.get()
          [
            semanticId: e.value('semanticId'),
            kind: e.value('kind'),
            fromId: e.outVertex().value('semanticId'),
            toId: e.inVertex().value('semanticId'),
            propertiesJson: e.value('propertiesJson')
          ]
        }.toList()
      groovy.json.JsonOutput.toJson([nodes: ns, edges: es])
    """
    raw = janus_request(
        url,
        script,
        {
            "nodeIds": [node.id for node in projection.nodes],
            "edgeIds": [edge.id for edge in projection.edges],
        },
    )
    if not isinstance(raw, str):
        raise RuntimeError(f"Unexpected JanusGraph canonical payload: {raw!r}")
    payload = json.loads(raw)
    nodes = [
        {
            "semanticId": row["semanticId"],
            "kind": row["kind"],
            "displayName": row["displayName"],
            "properties": json.loads(row.get("propertiesJson") or "{}"),
        }
        for row in payload["nodes"]
    ]
    edges = [
        {
            "semanticId": row["semanticId"],
            "kind": row["kind"],
            "from": row["fromId"],
            "to": row["toId"],
            "properties": json.loads(row.get("propertiesJson") or "{}"),
        }
        for row in payload["edges"]
    ]
    return canonical_snapshot(nodes, edges)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", required=True)
    parser.add_argument("--janus-url", default="http://127.0.0.1:8182")
    parser.add_argument("--python-url", default="http://127.0.0.1:8090")
    args = parser.parse_args()

    projection = KnowledgeProjection.model_validate_json(
        Path(args.fixture).read_text(encoding="utf-8")
    )
    expected = expected_snapshot(projection)
    expected_fingerprint = semantic_fingerprint(expected)

    ingest = httpx.post(
        f"{args.python_url}/v1/projections",
        json=json.loads(projection.model_dump_json(by_alias=True)),
        timeout=30,
    )
    ingest.raise_for_status()

    arcade_response = httpx.get(
        f"{args.python_url}/v1/canonical-snapshot",
        timeout=30,
    )
    arcade_response.raise_for_status()
    arcade_payload = arcade_response.json()
    arcade_snapshot = arcade_payload["snapshot"]
    arcade_fingerprint = arcade_payload["fingerprint"]

    load_into_janus(args.janus_url, projection)
    janus_snapshot = read_janus_snapshot(args.janus_url, projection)
    janus_fingerprint = semantic_fingerprint(janus_snapshot)

    if arcade_snapshot != expected:
        raise SystemExit(
            "ArcadeDB canonical readback differs from the fixture semantics.\n"
            + json.dumps(
                {"expected": expected, "arcade": arcade_snapshot},
                indent=2,
                sort_keys=True,
            )
        )

    if janus_snapshot != expected:
        raise SystemExit(
            "JanusGraph canonical readback differs from the fixture semantics.\n"
            + json.dumps(
                {"expected": expected, "janus": janus_snapshot},
                indent=2,
                sort_keys=True,
            )
        )

    if not (
        expected_fingerprint == arcade_fingerprint == janus_fingerprint
    ):
        raise SystemExit(
            "Knowledge backend semantic fingerprints diverged: "
            f"fixture={expected_fingerprint} "
            f"arcade={arcade_fingerprint} "
            f"janus={janus_fingerprint}"
        )

    print(
        "Knowledge backend parity proven: "
        f"{expected_fingerprint} "
        f"({len(expected['nodes'])} nodes, {len(expected['edges'])} edges)"
    )


if __name__ == "__main__":
    main()

from __future__ import annotations

import hashlib
import json
from typing import Any


SYNTHESIS_NODE_KINDS = {
    "Device",
    "Capability",
    "Interface",
    "Behavior",
    "Context",
    "Precondition",
    "Postcondition",
}

SYNTHESIS_EDGE_KINDS = {
    "hasCapability",
    "hasInterface",
    "hasBehavior",
    "hasContext",
    "hasPrecondition",
    "hasPostcondition",
}


def canonical_snapshot(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> dict[str, Any]:
    canonical_nodes = []
    for node in nodes:
        if node.get("kind") not in SYNTHESIS_NODE_KINDS:
            continue
        canonical_nodes.append(
            {
                "id": node["semanticId"],
                "kind": node["kind"],
                "label": node.get("displayName") or node["semanticId"],
                "properties": node.get("properties") or {},
            }
        )

    canonical_edges = []
    for edge in edges:
        if edge.get("kind") not in SYNTHESIS_EDGE_KINDS:
            continue
        canonical_edges.append(
            {
                "id": edge["semanticId"],
                "kind": edge["kind"],
                "from": edge["from"],
                "to": edge["to"],
                "properties": edge.get("properties") or {},
            }
        )

    canonical_nodes.sort(key=lambda item: item["id"])
    canonical_edges.sort(key=lambda item: item["id"])
    return {"nodes": canonical_nodes, "edges": canonical_edges}


def semantic_fingerprint(snapshot: dict[str, Any]) -> str:
    encoded = json.dumps(
        snapshot,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()

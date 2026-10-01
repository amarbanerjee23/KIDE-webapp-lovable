from app.canonical import canonical_snapshot, semantic_fingerprint


def test_canonical_snapshot_is_order_independent() -> None:
    nodes = [
        {"semanticId": "b", "kind": "Capability", "displayName": "B", "properties": {}},
        {"semanticId": "a", "kind": "Device", "displayName": "A", "properties": {"x": 1}},
    ]
    edges = [
        {"semanticId": "e", "kind": "hasCapability", "from": "a", "to": "b", "properties": {}}
    ]
    forward = canonical_snapshot(nodes, edges)
    reverse = canonical_snapshot(list(reversed(nodes)), list(reversed(edges)))
    assert forward == reverse
    assert semantic_fingerprint(forward) == semantic_fingerprint(reverse)


def test_canonical_snapshot_ignores_non_synthesis_graph_kinds() -> None:
    snapshot = canonical_snapshot(
        [
            {"semanticId": "device", "kind": "Device", "displayName": "Robot", "properties": {}},
            {"semanticId": "project", "kind": "Project", "displayName": "P", "properties": {}},
        ],
        [],
    )
    assert [node["id"] for node in snapshot["nodes"]] == ["device"]

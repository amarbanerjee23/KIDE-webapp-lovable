from app.models import KnowledgeProjection
from app.ontology import validate_projection


def test_complete_capability_contract_has_no_warning() -> None:
    projection = KnowledgeProjection.model_validate(
        {
            "schemaVersion": 1,
            "ontologyIri": "https://kide.dev/ontology/capability",
            "scope": "global",
            "generatedAt": "2026-09-30T00:00:00Z",
            "nodes": [
                {"id": "cap", "kind": "Capability", "label": "Move", "scope": "global"},
                {"id": "iface", "kind": "Interface", "label": "Motion", "scope": "global"},
                {"id": "behavior", "kind": "Behavior", "label": "Move", "scope": "global"},
                {"id": "context", "kind": "Context", "label": "Cell", "scope": "global"},
                {"id": "pre", "kind": "Precondition", "label": "Ready", "scope": "global"},
                {"id": "post", "kind": "Postcondition", "label": "Moved", "scope": "global"},
            ],
            "edges": [
                {"id": "e1", "kind": "hasInterface", "from": "cap", "to": "iface", "scope": "global"},
                {"id": "e2", "kind": "hasBehavior", "from": "cap", "to": "behavior", "scope": "global"},
                {"id": "e3", "kind": "hasContext", "from": "cap", "to": "context", "scope": "global"},
                {"id": "e4", "kind": "hasPrecondition", "from": "cap", "to": "pre", "scope": "global"},
                {"id": "e5", "kind": "hasPostcondition", "from": "cap", "to": "post", "scope": "global"},
            ],
        }
    )
    assert validate_projection(projection) == []


def test_incomplete_capability_contract_is_reported() -> None:
    projection = KnowledgeProjection.model_validate(
        {
            "schemaVersion": 1,
            "ontologyIri": "https://kide.dev/ontology/capability",
            "scope": "global",
            "generatedAt": "2026-09-30T00:00:00Z",
            "nodes": [
                {"id": "cap", "kind": "Capability", "label": "Move", "scope": "global"},
                {"id": "iface", "kind": "Interface", "label": "Motion", "scope": "global"},
            ],
            "edges": [
                {"id": "e1", "kind": "hasInterface", "from": "cap", "to": "iface", "scope": "global"},
            ],
        }
    )
    warnings = validate_projection(projection)
    assert len(warnings) == 1
    assert "hasPrecondition" in warnings[0]
    assert "hasPostcondition" in warnings[0]

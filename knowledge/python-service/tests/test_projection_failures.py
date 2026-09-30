import pytest

from app.models import KnowledgeProjection
from app.ontology import SemanticValidationError, validate_projection


def projection(nodes, edges, ontology="https://kide.dev/ontology/capability"):
    return KnowledgeProjection.model_validate(
        {
            "schemaVersion": 1,
            "ontologyIri": ontology,
            "scope": "global",
            "generatedAt": "2026-09-30T00:00:00Z",
            "nodes": nodes,
            "edges": edges,
        }
    )


def test_rejects_wrong_ontology_iri() -> None:
    value = projection([], [], ontology="https://example.invalid/ontology")
    with pytest.raises(SemanticValidationError, match="Unsupported ontology IRI"):
        validate_projection(value)


def test_rejects_duplicate_semantic_ids() -> None:
    value = projection(
        [
            {"id": "dup", "kind": "Device", "label": "One", "scope": "global"},
            {"id": "dup", "kind": "Device", "label": "Two", "scope": "global"},
        ],
        [],
    )
    with pytest.raises(SemanticValidationError, match="duplicate semantic node IDs"):
        validate_projection(value)


def test_rejects_missing_edge_endpoint() -> None:
    value = projection(
        [{"id": "d1", "kind": "Device", "label": "Device", "scope": "global"}],
        [
            {
                "id": "e1",
                "kind": "hasCapability",
                "from": "d1",
                "to": "missing",
                "scope": "global",
            }
        ],
    )
    with pytest.raises(SemanticValidationError, match="missing endpoint"):
        validate_projection(value)

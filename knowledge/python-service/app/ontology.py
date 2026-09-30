from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from rdflib import Graph
from pyshacl import validate

from .config import settings
from .models import KnowledgeProjection


REQUIRED_ONTOLOGY_CLASSES = {
    "Action",
    "Activity",
    "Device",
    "Capability",
    "Interface",
    "SessionType",
    "Workflow",
    "Behavior",
    "Interaction",
    "CapabilityInvocation",
}

CAPABILITY_TUPLE_EDGES = {
    "hasInterface",
    "hasBehavior",
    "hasContext",
    "hasPrecondition",
    "hasPostcondition",
}


class SemanticValidationError(ValueError):
    pass


def validate_ontology_assets() -> list[str]:
    ontology = Graph()
    ontology.parse(Path(settings.ontology_path), format="turtle")

    shacl = Graph()
    shacl.parse(Path(settings.shacl_path), format="turtle")

    conforms, _, report = validate(
        ontology,
        shacl_graph=shacl,
        inference="rdfs",
        abort_on_first=False,
        allow_infos=True,
        allow_warnings=True,
    )
    if not conforms:
        raise SemanticValidationError(f"KIDE ontology assets failed SHACL validation: {report}")

    serialized = ontology.serialize(format="turtle")
    missing = [name for name in sorted(REQUIRED_ONTOLOGY_CLASSES) if f":{name}" not in serialized]
    if missing:
        raise SemanticValidationError(
            "KIDE ontology is missing thesis classes: " + ", ".join(missing)
        )
    return []


def validate_projection(projection: KnowledgeProjection) -> list[str]:
    if projection.ontologyIri != "https://kide.dev/ontology/capability":
        raise SemanticValidationError(
            f"Unsupported ontology IRI: {projection.ontologyIri}"
        )

    ids = {node.id for node in projection.nodes}
    if len(ids) != len(projection.nodes):
        raise SemanticValidationError("Projection contains duplicate semantic node IDs.")

    for edge in projection.edges:
        if edge.from_ not in ids or edge.to not in ids:
            raise SemanticValidationError(f"Edge {edge.id} references a missing endpoint.")

    edges_by_source: dict[str, set[str]] = defaultdict(set)
    for edge in projection.edges:
        edges_by_source[edge.from_].add(edge.kind)

    warnings: list[str] = []
    for node in projection.nodes:
        if node.kind != "Capability":
            continue
        present = edges_by_source[node.id]
        missing = sorted(CAPABILITY_TUPLE_EDGES - present)
        if missing:
            warnings.append(
                f"Capability {node.id} is incomplete; missing contract links: "
                + ", ".join(missing)
            )

    return warnings

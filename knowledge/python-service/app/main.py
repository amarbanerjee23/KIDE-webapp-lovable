from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query

from .arcadedb import ArcadeDB, ArcadeDBError
from .canonical import canonical_snapshot, semantic_fingerprint
from .ingestion import IngestionDecision, IngestionRequest, normalize
from .models import GraphEntity, IngestResult, KnowledgeProjection
from .ontology import SemanticValidationError, validate_ontology_assets, validate_projection


app = FastAPI(
    title="KIDE Semantic Knowledge Service",
    version="0.1.0",
    description=(
        "Ontology-aware Python boundary for KIDE device knowledge. "
        "The RDF/OWL assets remain semantic authority; ArcadeDB is a property-graph projection."
    ),
)
db = ArcadeDB()


@app.on_event("startup")
def startup() -> None:
    validate_ontology_assets()
    db.initialize()


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "arcadeDbReady": db.ping(),
        "semanticAuthority": "knowledge/ontology/kide-capability.ttl",
        "projectionBackend": "arcadedb",
    }


@app.post("/v1/projections", response_model=IngestResult)
def replace_projection(projection: KnowledgeProjection) -> IngestResult:
    try:
        warnings = validate_projection(projection)
        node_count, edge_count = db.replace_projection(projection)
        return IngestResult(
            nodeCount=node_count,
            edgeCount=edge_count,
            validationWarnings=warnings,
        )
    except (SemanticValidationError, ArcadeDBError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/v1/devices", response_model=list[GraphEntity])
def list_devices(limit: int = Query(default=100, ge=1, le=1000)) -> list[GraphEntity]:
    return db.entities("Device", limit)


@app.get("/v1/capabilities", response_model=list[GraphEntity])
def list_capabilities(limit: int = Query(default=100, ge=1, le=1000)) -> list[GraphEntity]:
    return db.entities("Capability", limit)


@app.get("/v1/capabilities/{capability_id:path}/devices", response_model=list[GraphEntity])
def devices_for_capability(
    capability_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
) -> list[GraphEntity]:
    return db.devices_for_capability(capability_id, limit)


@app.get("/v1/canonical-snapshot")
def canonical_graph_snapshot() -> dict[str, object]:
    nodes, edges = db.canonical_graph()
    snapshot = canonical_snapshot(nodes, edges)
    return {
        "snapshot": snapshot,
        "fingerprint": semantic_fingerprint(snapshot),
    }


@app.post("/v1/ingestion/preview", response_model=IngestionDecision)
def preview_ingestion(request: IngestionRequest) -> IngestionDecision:
    return normalize(request)


@app.post("/v1/ingestion/commit", response_model=IngestResult)
def commit_ingestion(request: IngestionRequest) -> IngestResult:
    decision = normalize(request)
    if decision.status != "accepted":
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Device knowledge is quarantined and cannot be promoted.",
                "reasons": decision.reasons,
            },
        )
    try:
        node_count, edge_count = db.replace_projection(decision.projection)
        return IngestResult(
            nodeCount=node_count,
            edgeCount=edge_count,
            validationWarnings=[],
        )
    except ArcadeDBError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

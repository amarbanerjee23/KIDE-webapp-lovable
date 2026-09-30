# KIDE Python Semantic Knowledge Service

This service is an optional, additive knowledge backend for KIDE.

## Architecture

- The thesis RDF/OWL ontology in `knowledge/ontology` remains semantic authority.
- Python validates ontology assets and incoming KIDE graph projections.
- ArcadeDB stores an operational property-graph projection for traversal and future
  full-text/vector/GraphRAG retrieval.
- Existing JanusGraph/Cassandra persistence remains untouched and continues to be the default KIDE
  backend until parity and migration gates are explicitly passed.

This split is intentional: ArcadeDB is a property graph rather than an RDF/SPARQL triplestore,
while the thesis depends on ontology semantics and capability contracts.

## Start locally

```sh
docker compose -f compose.knowledge-python.yaml up --build
```

- Python API: http://localhost:8090
- ArcadeDB: http://localhost:2480

## Current endpoints

- `GET /health`
- `POST /v1/projections`
- `GET /v1/devices`
- `GET /v1/capabilities`
- `GET /v1/capabilities/{semantic-id}/devices`

## Non-breaking migration policy

1. Do not point KIDE production traffic at this service by default.
2. Shadow-write the same projection to JanusGraph and this service.
3. Compare node/edge counts and canonical query results.
4. Run synthesis unchanged against the current project model path.
5. Only permit graph-assisted synthesis after deterministic parity tests and explicit feature-flag
   enablement.

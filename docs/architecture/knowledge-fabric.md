# KIDE Knowledge Fabric

PR27 introduces the semantic persistence foundation for the thesis capability ontology.

## Semantic authority

KIDE deliberately separates four concerns:

1. **Project DSL source** is the source of truth for engineer-authored data, operation, control,
   capability and activity models.
2. **JanusGraph + Cassandra** is the scalable persistence substrate for semantic entities and
   relationships.
3. **The global device graph** will contain externally acquired device knowledge with provenance.
4. **Search indexes** are rebuildable retrieval projections and never semantic truth.

PR27 implements project graph projection and persistence. PR28 adds global ingestion/provenance.
PR29 adds OpenSearch hybrid/vector retrieval. PR30 adds the full Knowledge Explorer and solution
binding UX.

## Thesis alignment

The ontology assets under `knowledge/ontology` preserve the thesis classes and relationships:

- Action
- Activity
- Device
- Capability
- Interface
- SessionType
- Workflow
- fulfilledBy
- hasActivities
- hasCapability
- hasInteractions
- hasInterface
- implementsSession
- requiredCapability

The graph also operationalizes the capability contract:

`Capability = (Interface, Behavior, Context, Preconditions, Postconditions)`

KIDE extensions bind this semantic layer to Data Models, Operations, MNC Control Models,
Control Nodes, Commands, Responses, Events, Alarms, Data Points and Operating States.

The thesis inference rule for deriving `hasCapability` from a `CapabilityInvocation` is retained
in `knowledge/rules/thesis-capability.rules`.

## Project overlay

Project entities use deterministic URNs:

`urn:kide:project:<project-id>:<kind>:<source-path>:<name>`

A project overlay may reference global entities in later PRs, but a project publish operation may
never write into another project's overlay.

## Local graph stack

```sh
docker compose -f compose.yaml -f compose.knowledge.yaml up --build
```

This launches KIDE, PostgreSQL, Cassandra and JanusGraph. JanusGraph exposes the Gremlin
HTTP/WebSocket endpoint on port 8182.

The KIDE backend is only the authenticated I/O boundary. DSL parsing and semantic project
projection stay in browser TypeScript; the backend receives an already-computed projection and
persists it after project-role authorization.

## Scale path

Cassandra is the distributed persistence backend for JanusGraph. KIDE does not attempt expensive
whole-graph semantic search through Gremlin. PR29 will first retrieve a bounded candidate set from
a horizontally scaled OpenSearch projection and only then expand graph relationships and apply
compatibility reasoning.

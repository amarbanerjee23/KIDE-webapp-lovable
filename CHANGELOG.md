# Changelog

## 1.0.0 — Release candidate

KIDE 1.0.0 is the first official release candidate of the self-hosted, browser-compute systems-engineering workbench.

### Core engineering workflow

- five linked KIDE modelling languages with semantic editing and cross-model diagnostics;
- deterministic browser-side synthesis;
- ranked candidate designs with independent generated-model validation;
- qualification corpus, assurance gates, traceability and evidence ledgers;
- release bundles with SHA-256 checksums and manifest integrity;
- semantic multi-target code generation for ROS 2 Python, IEC 61131-3 Structured Text and Zetta Node.js;
- generated deployment-code provenance and release-manifest binding;
- project working-copy persistence, autosave, conflict handling and recovery;
- authenticated project/team/workspace flows.

### Authentication and persistence

- self-hosted Better Auth;
- PostgreSQL application persistence;
- Cloud SQL integration through managed Unix sockets;
- fail-closed production authentication;
- exact trusted-origin configuration;
- session and protected-route E2E coverage;
- restart-survivable authentication persistence.

### Knowledge fabric

- KIDE capability ontology aligned to the thesis semantics;
- JanusGraph project/global knowledge substrate;
- isolated Python semantic-validation service;
- ArcadeDB semantic projection;
- JanusGraph ↔ ArcadeDB semantic parity gate;
- provenance-aware trusted device ingestion with quarantine;
- graph-assisted synthesis shadow qualification;
- default-off candidate enrichment;
- promoted graph-input evidence with deterministic fingerprints;
- runtime production policy and kill switch;
- graph-drift approval invalidation and release blocking.

### Production readiness

- layered CI/CD across TypeScript, PostgreSQL, JanusGraph, ArcadeDB, semantic parity and browser E2E;
- GCP production launch preflight;
- Cloud SQL backup/PITR enforcement;
- live production smoke testing;
- launch/rollback, backup/restore and observability runbooks;
- public Privacy and Terms summaries;
- machine-readable launch acceptance evidence tied to the exact release commit.

### Operational posture

Graph-assisted synthesis remains explicitly controlled. The deterministic project-model synthesis path remains the production fallback and graph-only metadata is not used to fabricate executable control logic.

### Release acceptance

An official `v1.0.0` tag must only be created after production launch acceptance evidence verifies successfully for the exact tagged commit.

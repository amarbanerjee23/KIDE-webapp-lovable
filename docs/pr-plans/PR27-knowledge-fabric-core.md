# PR27 — KIDE Knowledge Fabric Core

## Objective
Introduce the thesis-aligned semantic foundation that binds device knowledge to KIDE data,
capability, activity and control models without moving KIDE domain computation out of the browser.

## Scope
- canonical KIDE semantic vocabulary and stable URIs;
- explicit global-knowledge vs project-overlay graph model;
- deterministic DSL/workspace to graph projection;
- semantic validation rules for device/interface/capability/activity/data/control bindings;
- TypeScript knowledge API contracts used by the web application;
- project-side semantic catalogue projection and graph preview;
- local self-hosted graph stack for development;
- CI tests for mapping determinism, graph validation, tenant/project isolation and deployment contracts.

## Architecture
- Browser KIDE workspace remains the source of truth for authored project models.
- The knowledge fabric is an external semantic persistence/search substrate.
- Project graph data must remain logically isolated and reference global entities by stable URI.
- Search indexes are rebuildable projections, never semantic truth.
- No server-side duplicate KIDE parser/synthesis implementation is introduced.

## Follow-on
- PR29: global device knowledge ingestion and provenance
- PR30: horizontally scalable hybrid semantic search
- PR31: Knowledge Explorer / solution-creation UX and project binding

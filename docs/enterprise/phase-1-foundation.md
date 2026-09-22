# Phase 1 — semantic and synthesis foundation

This change introduces the first deployable backend boundary for the enterprise KIDE architecture.

## Included

- Apache Jena Fuseki 6.2.0 build using Java 21 and a persistent TDB2 graph.
- Jena GenericRuleReasoner configuration implementing the required inferred `hasCapability` relation.
- RabbitMQ-backed Celery synthesis API/worker split.
- Deterministic server-side capability-to-device resolution against SPARQL.
- A Helm chart for Jena, RabbitMQ, synthesis API, and synthesis workers.
- Typed browser clients for the future asynchronous synthesis and Xtext LSP cutover.
- CI gates for frontend lint/typecheck/tests/build, Python compilation/unit tests/container build, Helm lint/render, Kubernetes client validation, and Jena container build.

## Security boundary

RabbitMQ does not use the built-in `guest` identity across pods. The chart references an existing Kubernetes Secret (default `kide-rabbitmq-auth`) with `username` and `password` keys. Production deployments should provision that secret using External Secrets Operator backed by GCP Secret Manager.

## Deliberate compatibility boundary

The existing browser synthesizer and local Monaco validation remain active in this phase. They are not silently removed before the cluster services and remote language server are available. The next migration phase can switch the UI over behind an explicit configuration flag and keep rollback simple.

## Next phase

1. Implement the complete sequential/parallel COMPOSEMACHINES state-machine algorithm and contract checks.
2. Add SSE/WebSocket synthesis progress to the web UI.
3. Add Xtext language-server service and `monaco-languageclient` integration.
4. Replace the current in-memory workspace store with the shared AST/Zustand model.
5. Add image vulnerability scanning and signed provenance after the service images are published to the project registry.

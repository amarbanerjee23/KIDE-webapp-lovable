# Production Observability and Alerts

KIDE launch monitoring should cover availability, authentication, persistence and the optional knowledge graph.

## Required signals

### Cloud Run

Alert on:

- sustained HTTP 5xx responses;
- elevated request latency;
- revision crash/restart loops;
- instance saturation or repeated startup failures.

### Authentication and PostgreSQL

Probe `/api/auth/health`. Alert when it returns non-200 or `operational: false`.

Track:

- Cloud SQL connection failures;
- Cloud SQL storage/CPU saturation;
- rejected or exhausted database connections;
- backup/PITR configuration drift.

### Knowledge graph

When graph-assisted synthesis is enabled, alert on trusted graph retrieval failures and repeated fallback to project-only synthesis.

A graph outage must not make baseline synthesis unavailable.

### Application errors

Cloud Logging should retain:

- server exceptions;
- auth runtime failures;
- persistence failures;
- knowledge ingestion/quarantine failures;
- graph runtime failures.

Never emit secret values, connection strings or card data into logs.

## Alert ownership

Before launch, every alert must have a human or team recipient and an escalation path. Alerts without an owner do not count as production monitoring.

## Suggested severity

- **Critical:** production unavailable, auth unavailable, release safety gate bypass risk, data-loss incident.
- **High:** sustained 5xx/latency, database degradation, repeated deployment failures.
- **Medium:** graph assistance degraded while project-only fallback remains healthy, ingestion failures.

# Cloud SQL Backup and Restore

KIDE production must run with Cloud SQL automated backups and point-in-time recovery (PITR) enabled. The launch preflight fails when either is disabled.

## Pre-launch restore drill

A backup is only useful after restoration has been tested.

For the launch drill:

1. identify a recent production backup or PITR timestamp;
2. restore into a separate recovery instance or clone; never overwrite the active production instance for a drill;
3. connect using an isolated recovery credential;
4. verify Better Auth tables and KIDE application tables exist;
5. verify at least one known organization/project record from the chosen recovery point;
6. run database integrity/read queries;
7. record recovery point, start/end timestamps and result;
8. keep the separate recovery instance RUNNABLE through protected production qualification, which reads the completed clone operation and recovery database metadata;
9. after qualification evidence and independent SQL integrity sign-off are retained, obtain operator approval and destroy only the designated recovery instance (never production).

## Recovery decision

Use PITR when the incident is logical corruption or accidental deletion and the desired timestamp is known. Use a backup restore when recovering from a larger database loss or when the required point is covered by a retained backup.

## Production recovery rules

- restore into a separate instance first;
- do not expose database credentials in terminal logs or tickets;
- do not overwrite the existing database until the recovered dataset has been validated;
- pause writes or otherwise establish a controlled cutover window before switching application traffic;
- after cutover, run `/api/auth/health` and the live smoke test;
- retain the original database until recovery is accepted.

## Launch evidence

Record:

- source instance;
- recovery point or backup ID;
- recovery instance;
- validation queries/results;
- operator;
- timestamps;
- final disposition.

## PR80 — Real Cloud SQL operation validation for qualification

The previous production qualification accepted any nonempty restore reference;
that is insufficient proof of a recovery operation. The protected workflow now
requires **two inputs**: the Cloud SQL `CLONE` operation ID and a separately
named recovery instance. It reads live Cloud SQL metadata and refuses:

- an incomplete/failed/non-clone operation or a clone older than 30 days;
- an operation whose target or project differs from the requested recovery instance;
- an unready recovery instance, a mismatched PostgreSQL engine or region;
- disabled production backup/PITR or a missing recovery application database;
- passing the production instance itself as the recovery target.

The qualification evidence contains a checksummed recovery-operation sidecar
and recovery-metadata log. The verifier cross-checks those bytes. The operation
**does not** independently establish that the source of the clone command was
the production instance, or that recovered tables and rows are intact.
Before dispatching qualification, the accountable operator must also inspect
the Cloud SQL clone request in Cloud Audit Logs and perform read-only SQL
inspection of Better Auth tables, KIDE schema and a known organization/project
on the isolated recovery instance. Record the SQL query results securely.
Do not consider the release ready without that separate signed record.

The workflow never provisions, modifies or deletes Cloud SQL instances; the
operator manages the clone lifecycle and its cost using the protected GCP
process. Never point app traffic or the live KIDE URL at the recovery instance.

## PR81 — Independent recovery-content inspection approval

The real clone operation/instance metadata gate does not establish that the
clone originated at the production source, nor that Better Auth and KIDE
tables/relations or a known organization/project can be read from the
recovered database. Retain protected read-only inspection results and Cloud
SQL clone audit-source evidence in private, accountable records.

After production qualification, the separate `Production operations release approval`
workflow requires HTTPS references to **both** items, plus monitoring, legal
and incident reviews, before its own protected independent review. The
publication workflow checks the completed run, matching qualified SHA and
the non-actor GitHub environment approval; it does not infer that external
records are accurate. The recovery clone is never a production traffic target.

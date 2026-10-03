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
8. destroy the recovery instance after evidence is retained.

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

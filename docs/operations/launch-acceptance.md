# Launch Acceptance Evidence

This is the final operational gate before tagging an official KIDE release.

## Required inputs

The operator must provide:

- `PROJECT_ID`: production Google Cloud project;
- `KIDE_URL`: deployed HTTPS production origin;
- `OPERATOR`: accountable launch operator or team identifier;
- `RESTORE_DRILL_REF`: reference to the completed database restore drill;
- optional `RELEASE_VERSION`, default `1.0.0`.

## Capture acceptance

Run from the exact green commit intended for release:

```sh
PROJECT_ID=<project> \
KIDE_URL=https://<production-origin> \
OPERATOR=<operator> \
RESTORE_DRILL_REF=<ticket-or-record> \
RELEASE_VERSION=1.0.0 \
bash scripts/launch/capture-acceptance.sh
```

The command:

1. records the exact Git commit;
2. runs the read-only GCP launch preflight;
3. runs the live deployed-environment smoke test;
4. hashes the outputs;
5. creates a machine-readable acceptance JSON;
6. verifies that the evidence is structurally complete.

It deliberately does not record credentials, secret values, database connection strings or payment data.

## Evidence retention

Retain together:

- `launch-acceptance-<sha>.json`;
- matching preflight log;
- matching smoke log;
- restore-drill evidence;
- Cloud Build run;
- Cloud Run revision.

Runtime launch evidence should be stored with the release/operations records rather than committed to source control.

## Release decision

Tag `v<releaseVersion>` only when:

- main CI is green for the same commit;
- launch acceptance evidence verifies successfully;
- the restore drill reference is valid;
- alerts have named owners;
- legal/business owners have accepted the public launch copy;
- no unresolved launch-blocking incident is open.

The release tag must point to the same `commitSha` recorded in acceptance evidence.

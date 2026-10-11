# Launch Acceptance Evidence

This is the final operational gate before tagging an official KIDE release.

## Required inputs

The operator must provide:

- `PROJECT_ID`: production Google Cloud project;
- `KIDE_URL`: deployed HTTPS production origin;
- `OPERATOR`: accountable launch operator or team identifier;
- `RESTORE_DRILL_REF`: completed Cloud SQL `CLONE` operation ID;
- `RESTORE_DRILL_RECOVERY_INSTANCE`: name of the distinct recovery Cloud SQL instance;
- optional `RELEASE_VERSION`, default `1.0.0`.

## Capture acceptance

Run from the exact green commit intended for release:

```sh
PROJECT_ID=<project> \
KIDE_URL=https://<production-origin> \
OPERATOR=<operator> \
RESTORE_DRILL_REF=<completed-cloud-sql-clone-operation-id> \
RESTORE_DRILL_RECOVERY_INSTANCE=<separate-recovery-instance> \
RELEASE_VERSION=1.0.0 \
bash scripts/launch/capture-acceptance.sh
```

The command:

1. records the exact Git commit;
2. runs the read-only GCP launch preflight;
3. validates a recent completed Cloud SQL clone operation, distinct recovery instance and listed PostgreSQL database;
4. runs the live deployed-environment smoke test;
5. verifies the deployed Cloud Run service carries that exact commit and commit-tagged image;
6. verifies 100% traffic is on the latest ready revision and compares its immutable digest with the independently resolved Artifact Registry commit-tagged image;
7. re-verifies Better Auth runtime configuration and the Cloud SQL attachment;
8. runs the live Chromium signup-to-release journey plus complete five-example source/checksum persistence and independently authenticated cross-organization isolation suites;
9. hashes the recovery, preflight, smoke, browser and deployment outputs;
10. creates schema-v2 machine-readable acceptance JSON with embedded deployment identity and browser-journey evidence;
11. verifies that the evidence is internally consistent and that each referenced log/JSON file actually exists, hashes to the claimed SHA-256 and matches the embedded deployment qualification.

It deliberately does not record credentials, secret values, database connection strings or payment data.

## Evidence retention

Retain together:

- `launch-acceptance-<sha>.json`;
- matching preflight log;
- matching smoke log;
- matching browser engineering-journey log;
- matching deployment qualification log and JSON;
- restore-drill evidence;
- Cloud Build run;
- Cloud Run revision and immutable image digest.

Runtime launch evidence should be stored with the release/operations records rather than committed to source control.

## Release decision

Tag `v<releaseVersion>` only when:

- main CI is green for the same commit;
- the manual `Production deployment qualification` workflow succeeded on that exact `main` SHA;
- the official release workflow downloads acceptance evidence from that qualification run rather than accepting pasted JSON;
- launch acceptance evidence verifies successfully;
- the restore drill reference is valid;
- alerts have named owners;
- legal/business owners have accepted the public launch copy;
- no unresolved launch-blocking incident is open.

The release tag must point to the same `commitSha` recorded in acceptance evidence.


## GitHub production qualification

For the official release path, dispatch **Production deployment qualification** from the
`main` branch. The protected `production` GitHub environment must provide:

- variable `GCP_PROJECT_ID`;
- optional variables `GCP_REGION` and `GCP_SERVICE_NAME` (defaults are `us-central1` and `kide-webapp`);
- secret `GCP_WORKLOAD_IDENTITY_PROVIDER`;
- secret `GCP_PRODUCTION_SERVICE_ACCOUNT`.

The workflow uses short-lived Workload Identity Federation credentials, uploads a
90-day `production-qualification-<sha>` artifact, and refuses to qualify a commit
that is not current `main`.

When publishing, provide the successful qualification workflow run ID. The publication
workflow validates the run identity, commit, branch and conclusion, downloads the
commit-scoped evidence artifact, and only then evaluates the release gates.

## Browser test prerequisites and test-data policy

Install the frozen Bun dependencies and Chromium with
`bun install --frozen-lockfile` and `bunx playwright install --with-deps chromium`
before capturing acceptance locally. The GitHub production qualification workflow
installs both automatically.

Repeated smoke and browser runs use cryptographically randomized unique test accounts
(`launch-smoke-` and `kide-qualification-` prefixes) and do not reuse passwords.
They create real production records, including multiple starter projects and independently authenticated tenant test accounts. Treat them as operational qualification data and
retain them until the operations owner approves cleanup under the database audit and
evidence-retention policy. Do not commit logs, browser traces or credentials.

## Tamper-evident sidecars (PR79)

Acceptance is valid only with its original downloaded production qualification
artifact directory. The validator reads and hashes the preflight, auth smoke,
live Chromium journey and deployment qualification logs plus the standalone
Cloud Run qualification JSON. It verifies the embedded deployment object is
identical to that downloaded qualification JSON. Missing or edited files reject
release publication. A standalone copied acceptance JSON is **not** evidence.

The checks prove artifact consistency, not that a real Cloud SQL restore drill
occurred: the accountable operator must still furnish a genuine restore
record and GitHub protected environment approvals.

## Verified clone provenance (PR80)

Before accepting a launch candidate, the evidence collector queries the
completed Cloud SQL clone operation, separate recovery instance and application
database listing using the authorized production GCP identity. It retains
`restore-operation-<sha>.json` and `restore-metadata-<sha>.log`, both SHA-256
bound to the launch acceptance record. These must be present when the official
release workflow validates downloaded acceptance artifacts.

This validates Cloud SQL metadata, not restored SQL table contents or the
original clone command source. The operator must separately retain evidence
that the clone originated from production and that real recovered application
records and relationships were inspected read-only before signing off.

# Official Release Publication

KIDE official releases are published manually through the guarded GitHub Actions workflow:

`Publish official release`

The workflow does not run on push, pull request, merge or schedule.

## Prerequisites

Before invoking the workflow:

1. the intended release candidate must be the current `main` commit;
2. `main` CI must have completed successfully for that exact commit;
3. the production database restore drill must be complete;
4. production launch preflight must have passed;
5. the live production smoke test must have passed;
6. `scripts/launch/capture-acceptance.sh` must have produced verified acceptance evidence;
7. the acceptance JSON must identify the exact current `main` commit;
8. the GitHub `production` environment should have appropriate reviewer protection configured.

## Publish

In GitHub Actions, open **Publish official release** and choose **Run workflow**.

Provide:

- the complete verified launch acceptance JSON;
- confirmation text exactly `PUBLISH v1.0.0`.

The workflow checks out current `main`, verifies the acceptance evidence, requires the evidence commit to equal current `main`, and queries GitHub Actions for a successful `main` CI run for that exact SHA.

It then rejects publication if `v1.0.0` already exists as a tag or GitHub Release.

## Published release

If every gate passes, the workflow creates the GitHub Release with:

- tag `v1.0.0` targeting the accepted `main` commit;
- the reviewed release notes from `docs/releases/v1.0.0.md`;
- the accepted commit SHA;
- SHA-256 of the launch acceptance evidence.

The full acceptance JSON is not included in the public release notes.

## Failure behavior

A failed validation creates no release.

The workflow never force-updates or overwrites an existing release tag. If a publication issue occurs, investigate before retrying; never delete or move an official tag simply to bypass a failed gate.

## Post-publication

After publication:

1. verify the GitHub Release tag resolves to the accepted commit;
2. rerun the production health endpoint and smoke test if any production configuration changed during publication;
3. retain the acceptance JSON, preflight/smoke logs, restore-drill record, Cloud Build run and Cloud Run revision with the operational release record.

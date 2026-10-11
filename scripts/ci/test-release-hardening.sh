#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "Release hardening CI failure: $*" >&2
  exit 1
}

test -f src/lib/kide/release-hardening.test.ts || fail "cross-domain release hardening matrix missing"
test -f tests/e2e/release-journey.spec.ts || fail "release customer journey E2E missing"

grep -q 'EXAMPLE_WORKSPACES' src/lib/kide/release-hardening.test.ts   || fail "hardening suite must cover the explicit example library"
grep -q 'parseMnc(candidate.generatedMnc)' src/lib/kide/release-hardening.test.ts   || fail "generated MNC must be independently parsed"
grep -q 'artifact.sha256' src/lib/kide/release-hardening.test.ts   || fail "release artifacts must be independently checksummed"
grep -q 'manifestHash' src/lib/kide/release-hardening.test.ts   || fail "release manifest identity must be tested"
grep -q 'release-journey.spec.ts' playwright.config.ts   || fail "Playwright configured-auth project must execute release journeys"
grep -q 'waitForEvent("download")' tests/e2e/release-journey.spec.ts   || fail "customer journey must inspect an actual downloaded release bundle"
grep -q 'approval is invalidated' tests/e2e/release-journey.spec.ts   || fail "customer journey must prove approval drift blocks release"
grep -q 'compact viewport' tests/e2e/release-journey.spec.ts   || fail "compact viewport CX coverage missing"

grep -q 'isCurrentAutosaveTicket' src/lib/kide/useWorkspacePersistence.ts ||
  fail "autosave must reject stale project or reload completions"
grep -q 'inFlightSaveRef.current' src/lib/kide/useWorkspacePersistence.ts ||
  fail "autosave must serialize writes against the PostgreSQL CAS revision"
grep -q 'hasQueuedAutosave' src/lib/kide/useWorkspacePersistence.ts ||
  fail "autosave must flush edits made while a request is pending"

grep -q 'validateWorkingCopySources(sources)' src/lib/kide/model-exchange.ts ||
  fail "model imports must satisfy the server's real persistence limits"
grep -q 'isAcceptableModelSetSize(file.size)' src/routes/_authenticated/checkpoints.tsx ||
  fail "oversized model-set files must be rejected before reading in the browser"
grep -q 'over-limit-model-set.json' tests/e2e/checkpoint-integrity.spec.ts ||
  fail "PostgreSQL-backed import E2E must prove over-limit files cannot replace saved models"

grep -q 'validateWorkingCopySources({ ...sources, \[path\]: value })' src/lib/kide/workspace-store.ts ||
  fail "Monaco edits must respect the persisted source-size and aggregate limits"
grep -q 'validateWorkingCopySources({' src/lib/kide/workspace-store.ts ||
  fail "local file creation must respect the persisted 100-file limit"
grep -q 'revertingRef.current' src/components/kide/MonacoDslEditorImpl.tsx ||
  fail "rejected Monaco edits must restore the last accepted editor contents"
grep -q 'custom/FieldSensors' tests/e2e/first-run-ux-acceptance.spec.ts ||
  fail "first-run browser suite must prove created source persists after reload"

grep -q 'FOR UPDATE' src/lib/project-working-copy.functions.ts ||
  fail "first working-copy insert must serialize on the project row"
grep -q 'assertSingleWorkingCopy(existingRows)' src/lib/project-working-copy.functions.ts ||
  fail "duplicate working-copy records must fail closed"
grep -q 'initial-working-copy-race.spec.ts' playwright.config.ts ||
  fail "two-tab concurrent initial saves must run in production browser E2E"

grep -q 'status: offline ? "offline" : "load-error"' src/lib/kide/useWorkspacePersistence.ts ||
  fail "initial workspace load failures must differ from failed autosaves"
grep -q 'isWorkspaceLoadFailure(activeSaveState.status)' src/routes/models.tsx ||
  fail "autosave errors must never replace the in-memory model editor"
grep -q 'requestWorkspaceSaveRetry' src/routes/models.tsx ||
  fail "the model editor must retry saving without reloading and losing local edits"
grep -q 'Export local backup' src/routes/models.tsx ||
  fail "unsaved or conflicted model sources must have a local recovery export"
grep -q 'offline-model-recovery.spec.ts' playwright.config.ts ||
  fail "offline local export and reconnect must be in the configured browser matrix"

bash scripts/ci/test-role-gated-cx.sh

bunx vitest run   src/lib/kide/release-hardening.test.ts   src/lib/kide/qualification.test.ts   src/lib/kide/assurance.test.ts   src/lib/kide/kide.test.ts

echo "Cross-domain synthesis, generated-code, release-integrity and CX contracts passed."

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

bash scripts/ci/test-role-gated-cx.sh

bunx vitest run   src/lib/kide/release-hardening.test.ts   src/lib/kide/qualification.test.ts   src/lib/kide/assurance.test.ts   src/lib/kide/kide.test.ts

echo "Cross-domain synthesis, generated-code, release-integrity and CX contracts passed."

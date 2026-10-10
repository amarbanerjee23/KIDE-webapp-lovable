#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "Role-gated customer journey regression: $*" >&2
  exit 1
}

grep -q 'const canCreateProject' src/routes/_authenticated/checkpoints.tsx ||
  fail "checkpoint project creation must be role gated"
grep -q 'canCreateProject ?' src/routes/_authenticated/checkpoints.tsx ||
  fail "read-only roles must not see checkpoint project-creation controls"
grep -q 'const canRequestReview' src/routes/_authenticated/reviews.tsx ||
  fail "review creation must follow server-side editor roles"
grep -q 'disabled={!canRequestReview || !selection.projectId}' src/routes/_authenticated/reviews.tsx ||
  fail "review-only users must not enter an unsendable review request"
grep -q 'New checkpoint project name' tests/e2e/organization-selection-integrity.spec.ts ||
  fail "cross-tenant browser suite must check project creation controls"
grep -q 'Alpha-only review request' tests/e2e/organization-selection-integrity.spec.ts ||
  fail "cross-tenant browser suite must check stale review draft clearing"

echo "Role-gated review and checkpoint CX contracts validated."

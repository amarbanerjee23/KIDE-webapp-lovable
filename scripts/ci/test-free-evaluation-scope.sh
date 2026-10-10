#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "v1.0.0 free evaluation scope failure: $*" >&2
  exit 1
}

grep -Fq 'PAID_BILLING_ENABLED: boolean = false' src/lib/billing-policy.ts \
  || fail "paid billing must remain statically disabled for v1.0.0"
grep -Fq 'if (!PAID_BILLING_ENABLED) return { configured: false };' src/lib/billing.functions.ts \
  || fail "server checkout must reject all paid attempts"
grep -Fq 'if (!PAID_BILLING_ENABLED)' src/routes/api/public/hyperswitch-webhook.ts \
  || fail "webhook must fail closed before processing payments"
grep -Fq 'Paid checkout is unavailable' src/routes/_authenticated/checkout.tsx \
  || fail "direct checkout visits must show a truthful unavailable state"
if grep -Eq '1 organization|3 projects|5 team members|per user / month|Upgrade' src/routes/_authenticated/billing.tsx; then
  fail "billing UI advertises unimplemented quotas, seat prices or upgrade actions"
fi
grep -Fq 'v1.0.0 free evaluation is truthful' tests/e2e/team-and-billing.spec.ts \
  || fail "direct checkout and billing browser regression is missing"

echo "v1.0.0 free evaluation commercial scope validated."

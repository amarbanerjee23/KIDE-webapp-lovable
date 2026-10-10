#!/usr/bin/env bash
set -euo pipefail

KIDE_URL="${KIDE_URL:-}"
[[ -n "${KIDE_URL}" ]] || { echo "Set KIDE_URL to the deployed KIDE origin." >&2; exit 2; }
KIDE_URL="${KIDE_URL%/}"

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
cookies="${tmp}/cookies.txt"

echo "Checking landing page..."
curl --fail --silent --show-error --max-time 15 "${KIDE_URL}/" | grep -Fq "KIDE"   || { echo "Landing page smoke test failed." >&2; exit 1; }

echo "Checking auth readiness..."
health="$(curl --fail --silent --show-error --max-time 15 "${KIDE_URL}/api/auth/health")"
printf '%s' "${health}" | grep -Eq '"operational"[[:space:]]*:[[:space:]]*true'   || { echo "Authentication health is not operational." >&2; exit 1; }

run_id="${KIDE_LAUNCH_RUN_ID:-manual}"
safe_run_id="$(printf '%s' "$run_id" | tr -cd '[:alnum:]' | cut -c1-16)"
[[ -n "$safe_run_id" ]] || safe_run_id=manual
# The same release commit may be qualified repeatedly; each invocation needs a new account.
nonce="$(openssl rand -hex 12)"
email="launch-smoke-${safe_run_id}-${nonce}@example.com"
password="Kide-Launch-Smoke-$(openssl rand -hex 24)!Aa1"

echo "Creating disposable launch-smoke account..."
signup="$(curl --fail-with-body --silent --show-error   -H 'content-type: application/json'   -c "${cookies}"   --data "{\"name\":\"Launch Smoke\",\"email\":\"${email}\",\"password\":\"${password}\"}"   "${KIDE_URL}/api/auth/sign-up/email")"
printf '%s' "${signup}" | grep -Fq "${email}"   || { echo "Sign-up smoke test failed." >&2; exit 1; }

echo "Checking authenticated session..."
session="$(curl --fail-with-body --silent --show-error -b "${cookies}"   "${KIDE_URL}/api/auth/get-session")"
printf '%s' "${session}" | grep -Fq "${email}"   || { echo "Authenticated session smoke test failed." >&2; exit 1; }

echo "Checking protected-route response with authenticated cookies..."
curl --fail --silent --show-error -b "${cookies}" "${KIDE_URL}/projects" >/dev/null   || { echo "Authenticated protected-route smoke test failed." >&2; exit 1; }

echo "Checking anonymous protected-route fail-closed behavior..."
final_url="$(curl --silent --show-error --location --output /dev/null   --write-out '%{url_effective}' "${KIDE_URL}/projects")"
[[ "${final_url}" == "${KIDE_URL}/" ]]   || { echo "Anonymous protected route did not return to KIDE home: ${final_url}" >&2; exit 1; }

echo "Launch smoke passed for ${KIDE_URL}."

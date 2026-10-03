#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HEX64 = re.compile(r"^[0-9a-f]{64}$")
HEX40 = re.compile(r"^[0-9a-f]{40}$")

def fail(message: str) -> None:
    raise SystemExit(f"Launch acceptance evidence invalid: {message}")

if len(sys.argv) != 2:
    fail("usage: verify-acceptance.py <evidence.json>")

path = Path(sys.argv[1])
if not path.is_file():
    fail(f"missing file: {path}")

payload = json.loads(path.read_text(encoding="utf-8"))

if payload.get("schemaVersion") != 1:
    fail("unsupported schemaVersion")
if not isinstance(payload.get("releaseVersion"), str) or not payload["releaseVersion"].strip():
    fail("releaseVersion is required")
if not HEX40.fullmatch(str(payload.get("commitSha", ""))):
    fail("commitSha must be a full Git SHA")
if not str(payload.get("productionOrigin", "")).startswith("https://"):
    fail("productionOrigin must be HTTPS")
if not payload.get("operator"):
    fail("operator is required")
if not payload.get("restoreDrillReference"):
    fail("restoreDrillReference is required")
if payload.get("secretsCaptured") is not False:
    fail("secretsCaptured must be false")

checks = payload.get("checks")
if not isinstance(checks, dict):
    fail("checks object is required")

for key in ("gcpLaunchPreflight", "liveSmoke"):
    check = checks.get(key)
    if not isinstance(check, dict):
        fail(f"{key} check is required")
    if check.get("status") != "passed":
        fail(f"{key} did not pass")
    if not HEX64.fullmatch(str(check.get("outputSha256", ""))):
        fail(f"{key} outputSha256 must be SHA-256")

print(f"Launch acceptance evidence verified: {path}")

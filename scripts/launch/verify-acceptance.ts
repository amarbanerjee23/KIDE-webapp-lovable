import { readFileSync } from "node:fs";

const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;

function fail(message: string): never {
  throw new Error(`Launch acceptance evidence invalid: ${message}`);
}

const path = process.argv[2];
if (!path) fail("usage: bun scripts/launch/verify-acceptance.ts <evidence.json>");

const payload = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

if (payload["schemaVersion"] !== 1) fail("unsupported schemaVersion");
if (typeof payload["releaseVersion"] !== "string" || !payload["releaseVersion"].trim()) {
  fail("releaseVersion is required");
}
if (!HEX40.test(String(payload["commitSha"] ?? ""))) {
  fail("commitSha must be a full Git SHA");
}
if (!String(payload["productionOrigin"] ?? "").startsWith("https://")) {
  fail("productionOrigin must be HTTPS");
}
if (!payload["operator"]) fail("operator is required");
if (!payload["restoreDrillReference"]) fail("restoreDrillReference is required");
if (payload["secretsCaptured"] !== false) fail("secretsCaptured must be false");

const checks = payload["checks"];
if (!checks || typeof checks !== "object" || Array.isArray(checks)) {
  fail("checks object is required");
}

for (const key of ["gcpLaunchPreflight", "liveSmoke"] as const) {
  const check = (checks as Record<string, unknown>)[key];
  if (!check || typeof check !== "object" || Array.isArray(check)) {
    fail(`${key} check is required`);
  }
  const record = check as Record<string, unknown>;
  if (record["status"] !== "passed") fail(`${key} did not pass`);
  if (!HEX64.test(String(record["outputSha256"] ?? ""))) {
    fail(`${key} outputSha256 must be SHA-256`);
  }
}

console.log(`Launch acceptance evidence verified: ${path}`);

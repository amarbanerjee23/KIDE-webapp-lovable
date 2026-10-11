import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";

const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/;

function fail(message: string): never {
  throw new Error(`Launch acceptance evidence invalid: ${message}`);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${name} object is required`);
  }
  return value as Record<string, unknown>;
}

const path = process.argv[2];
if (!path) fail("usage: bun scripts/launch/verify-acceptance.ts <evidence.json>");

const payload = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

if (payload["schemaVersion"] !== 2) fail("unsupported schemaVersion");
if (typeof payload["releaseVersion"] !== "string" || !payload["releaseVersion"].trim()) {
  fail("releaseVersion is required");
}
const commitSha = String(payload["commitSha"] ?? "");
if (!HEX40.test(commitSha)) {
  fail("commitSha must be a full Git SHA");
}
const productionOrigin = String(payload["productionOrigin"] ?? "").replace(/\/$/, "");
if (!productionOrigin.startsWith("https://")) {
  fail("productionOrigin must be HTTPS");
}
if (!payload["operator"]) fail("operator is required");
if (!payload["restoreDrillReference"]) fail("restoreDrillReference is required");
if (payload["secretsCaptured"] !== false) fail("secretsCaptured must be false");

// The successful qualification workflow stores evidence alongside this JSON.
// A checksum-shaped string without its exact sidecar bytes is not release proof.
const checks = record(payload["checks"], "checks");
const evidenceDirectory = dirname(path);
const evidenceFileNames = {
  gcpLaunchPreflight: `preflight-${commitSha}.log`,
  liveSmoke: `smoke-${commitSha}.log`,
  productionBrowserJourney: `browser-journey-${commitSha}.log`,
  deploymentQualification: `deployment-qualification-${commitSha}.json`,
  databaseRestoreDrill: `restore-operation-${commitSha}.json`,
} as const;

function verifySidecar(name: string, expectedHash: unknown): void {
  const file = join(evidenceDirectory, name);
  let contents: Buffer;
  try {
    contents = readFileSync(file);
  } catch {
    fail(`evidence file missing: ${name}`);
  }
  const actualHash = createHash("sha256").update(contents).digest("hex");
  if (actualHash !== expectedHash) {
    fail(`evidence file SHA-256 mismatch: ${name}`);
  }
}

for (const key of [
  "databaseRestoreDrill",
  "gcpLaunchPreflight",
  "liveSmoke",
  "productionBrowserJourney",
  "deploymentQualification",
] as const) {
  const check = record(checks[key], `${key} check`);
  if (check["status"] !== "passed") fail(`${key} did not pass`);
  if (!HEX64.test(String(check["outputSha256"] ?? ""))) {
    fail(`${key} outputSha256 must be SHA-256`);
  }
  verifySidecar(evidenceFileNames[key], check["outputSha256"]);
}
const deploymentCheck = record(checks["deploymentQualification"], "deploymentQualification check");
if (!HEX64.test(String(deploymentCheck["logSha256"] ?? ""))) {
  fail("deploymentQualification logSha256 must be SHA-256");
}
verifySidecar(`deployment-${commitSha}.log`, deploymentCheck["logSha256"]);
const restoreCheck = record(checks["databaseRestoreDrill"], "databaseRestoreDrill check");
if (!HEX64.test(String(restoreCheck["logSha256"] ?? ""))) {
  fail("databaseRestoreDrill logSha256 must be SHA-256");
}
verifySidecar(`restore-metadata-${commitSha}.log`, restoreCheck["logSha256"]);

const restore = record(payload["restoreDrill"], "restoreDrill");
const restoreFromFile = JSON.parse(
  readFileSync(join(evidenceDirectory, evidenceFileNames.databaseRestoreDrill), "utf8"),
) as unknown;
if (!isDeepStrictEqual(restoreFromFile, restore)) {
  fail("embedded restore drill metadata does not match the verified source evidence");
}
if (
  restore["schemaVersion"] !== 1 ||
  restore["projectId"] !== record(payload["deployment"], "deployment")["projectId"] ||
  restore["operationId"] !== payload["restoreDrillReference"] ||
  restore["operationType"] !== "CLONE" ||
  restore["operationStatus"] !== "DONE" ||
  restore["sourceInstance"] === restore["recoveryInstance"] ||
  restore["recoveryState"] !== "RUNNABLE" ||
  restore["backupConfigured"] !== true ||
  restore["pitrConfigured"] !== true ||
  restore["recoveryDatabaseListed"] !== true ||
  restore["contentQueriesVerified"] !== false ||
  restore["sourceRequestVerified"] !== false ||
  restore["secretsCaptured"] !== false
) {
  fail("Cloud SQL restore drill metadata verification is incomplete or inconsistent");
}

const deployment = record(payload["deployment"], "deployment");
const fileDeployment = JSON.parse(
  readFileSync(join(evidenceDirectory, evidenceFileNames.deploymentQualification), "utf8"),
) as unknown;
if (!isDeepStrictEqual(fileDeployment, deployment)) {
  fail("embedded deployment qualification does not match verified source evidence");
}
if (deployment["schemaVersion"] !== 1) {
  fail("deployment schemaVersion is unsupported");
}
if (deployment["commitSha"] !== commitSha) {
  fail("deployment commitSha does not match acceptance commitSha");
}
const serviceUrl = String(deployment["serviceUrl"] ?? "").replace(/\/$/, "");
if (serviceUrl !== productionOrigin) {
  fail("deployment serviceUrl does not match productionOrigin");
}
if (deployment["authDeploymentState"] !== "configured") {
  fail("deployment authentication state must be configured");
}
if (deployment["trafficPercent"] !== 100) {
  fail("deployment must route 100% traffic to the qualified revision");
}
if (deployment["secretsCaptured"] !== false) {
  fail("deployment evidence must not capture secrets");
}
for (const key of [
  "projectId",
  "region",
  "serviceName",
  "latestReadyRevision",
  "revisionImage",
  "cloudSqlConnection",
  "qualifiedAt",
] as const) {
  if (typeof deployment[key] !== "string" || !String(deployment[key]).trim()) {
    fail(`deployment ${key} is required`);
  }
}

const buildImage = String(deployment["buildImage"] ?? "");
if (!buildImage.endsWith(`:${commitSha}`)) {
  fail("deployment buildImage is not tagged with the accepted commit");
}
if (!IMAGE_DIGEST.test(String(deployment["imageDigest"] ?? ""))) {
  fail("deployment imageDigest must be an immutable SHA-256 digest");
}
if (deployment["registryImageDigest"] !== deployment["imageDigest"]) {
  fail("Cloud Run and Artifact Registry image digests must match");
}
const registryDigest = String(deployment["registryImageDigest"] ?? "");
if (!IMAGE_DIGEST.test(registryDigest)) {
  fail("deployment registryImageDigest must be an immutable SHA-256 digest");
}

console.log(`Launch acceptance evidence verified: ${path}`);

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Generates internally consistent synthetic acceptance sidecars for CI only.
// Production proof must come from a protected qualification workflow, never
// from this helper or operator-entered acceptance JSON.
const path = process.argv[2];
if (!path) throw new Error("usage: node write-acceptance-fixture.mjs <acceptance.json>");
const payload = JSON.parse(readFileSync(path, "utf8"));
const directory = dirname(path);
const sha = payload.commitSha;
const files = {
  gcpLaunchPreflight: [`preflight-${sha}.log`, "Cloud SQL backups and PITR active\n"],
  liveSmoke: [`smoke-${sha}.log`, "Better Auth / PostgreSQL smoke passed\n"],
  productionBrowserJourney: [
    `browser-journey-${sha}.log`,
    "Production browser acceptance passed\n",
  ],
  databaseRestoreDrill: [
    `restore-operation-${sha}.json`,
    JSON.stringify({
      schemaVersion: 1,
      projectId: payload.deployment.projectId,
      sourceInstance: "kide-web-app",
      recoveryInstance: "kide-restore-ci",
      operationId: payload.restoreDrillReference,
      operationType: "CLONE",
      operationStatus: "DONE",
      operationEndedAt: new Date().toISOString(),
      databaseName: "kide",
      recoveryState: "RUNNABLE",
      engine: "POSTGRES_17",
      backupConfigured: true,
      pitrConfigured: true,
      recoveryDatabaseListed: true,
      metadataVerifiedAt: new Date().toISOString(),
      contentQueriesVerified: false,
      sourceRequestVerified: false,
      secretsCaptured: false,
    }, null, 2) + "\\n",
  ],
  deploymentQualification: [
    `deployment-qualification-${sha}.json`,
    JSON.stringify(payload.deployment, null, 2) + "\n",
  ],
};

for (const [key, [name, body]] of Object.entries(files)) {
  writeFileSync(join(directory, name), body);
  if (!payload.checks[key]) payload.checks[key] = { status: "passed" };
  payload.checks[key].outputSha256 = createHash("sha256").update(body).digest("hex");
  if (key === "databaseRestoreDrill") payload.restoreDrill = JSON.parse(body);
}
const deploymentLog = "Cloud Run and Artifact Registry image digests match\n";
writeFileSync(join(directory, `deployment-${sha}.log`), deploymentLog);
payload.checks.deploymentQualification.logSha256 = createHash("sha256")
  .update(deploymentLog)
  .digest("hex");
const restoreLog = "Cloud SQL separate recovery operation and database metadata verified\\n";
writeFileSync(join(directory, `restore-metadata-${sha}.log`), restoreLog);
payload.checks.databaseRestoreDrill.logSha256 = createHash("sha256")
  .update(restoreLog)
  .digest("hex");
writeFileSync(path, JSON.stringify(payload, null, 2) + "\n");

import { readFileSync, writeFileSync } from "node:fs";

// Validate *live* Cloud SQL Admin API responses. Only metadata is retained.
// This does NOT attest to recovered row integrity or the source clone request:
// an operator must independently confirm those checks before release.
function fail(reason) {
  throw new Error(`Cloud SQL restore drill rejected: ${reason}`);
}
const [
  operationPath,
  sourcePath,
  recoveryPath,
  databasesPath,
  projectId,
  sourceId,
  recoveryId,
  databaseName,
  operationId,
  outputPath,
] = process.argv.slice(2);
if ([operationPath, sourcePath, recoveryPath, databasesPath, projectId, sourceId,
     recoveryId, databaseName, operationId, outputPath].some((value) => !value)) {
  fail("requires operation/source/recovery/databases JSON and exact expected resource IDs");
}
if (sourceId === recoveryId) fail("recovery instance must be separate from production");
const op = JSON.parse(readFileSync(operationPath, "utf8"));
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const recovery = JSON.parse(readFileSync(recoveryPath, "utf8"));
const databases = JSON.parse(readFileSync(databasesPath, "utf8"));
if (op.name !== operationId || op.operationType !== "CLONE" || op.status !== "DONE") {
  fail("operation is not the specified completed Cloud SQL clone");
}
if (op.targetId !== recoveryId || op.targetProject !== projectId) {
  fail("clone operation target or project does not match the recovery instance");
}
if (Array.isArray(op.error?.errors) && op.error.errors.length > 0) {
  fail("clone operation reports errors");
}
const completed = Date.parse(op.endTime ?? "");
if (!Number.isFinite(completed) || completed > Date.now() + 60_000 ||
    completed < Date.now() - 30 * 24 * 60 * 60 * 1000) {
  fail("clone completion time is missing, future-dated or older than 30 days");
}
if (source.name !== sourceId || recovery.name !== recoveryId) {
  fail("Cloud SQL instances do not match requested resource names");
}
if (source.project !== projectId || recovery.project !== projectId) {
  fail("Cloud SQL instances are not in the expected production project");
}
if (source.state !== "RUNNABLE" || recovery.state !== "RUNNABLE") {
  fail("source or recovery instance is not RUNNABLE");
}
if (!String(source.databaseVersion ?? "").startsWith("POSTGRES_") ||
    source.databaseVersion !== recovery.databaseVersion ||
    source.region !== recovery.region) {
  fail("recovery engine version or region does not match PostgreSQL source");
}
const backup = source.settings?.backupConfiguration;
if (backup?.enabled !== true || backup?.pointInTimeRecoveryEnabled !== true) {
  fail("source Cloud SQL automated backup and point-in-time recovery must be enabled");
}
if (!Array.isArray(databases) ||
    !databases.some((db) => db.name === databaseName &&
      (!db.instance || db.instance === recoveryId))) {
  fail("required application database is absent from the recovery instance");
}
const evidence = {
  schemaVersion: 1,
  projectId,
  sourceInstance: sourceId,
  recoveryInstance: recoveryId,
  operationId,
  operationType: "CLONE",
  operationStatus: "DONE",
  operationEndedAt: new Date(completed).toISOString(),
  databaseName,
  recoveryState: "RUNNABLE",
  engine: source.databaseVersion,
  backupConfigured: true,
  pitrConfigured: true,
  recoveryDatabaseListed: true,
  metadataVerifiedAt: new Date().toISOString(),
  contentQueriesVerified: false,
  sourceRequestVerified: false,
  secretsCaptured: false,
};
writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + "\n");
console.log("Separate Cloud SQL clone operation and recovery database metadata verified.");

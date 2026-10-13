import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const SHA = /^[0-9a-f]{40}$/;
const INSTANCE = /^kide-recovery-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/;
const SOURCE = /^[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

function fail(reason) {
  throw new Error(`Protected Cloud SQL recovery rejected: ${reason}`);
}

export function authorizeRecovery(request, now = Date.now()) {
  const { expectedSha, dispatchedSha, mainSha, gitRef, attempt, source, target, project, region,
    pointInTime, confirmation } = request;
  if (gitRef !== "refs/heads/main" || !SHA.test(expectedSha ?? "") ||
      expectedSha !== dispatchedSha || mainSha !== expectedSha) {
    fail("requested, dispatched and current main must match the same full SHA");
  }
  if (String(attempt) !== "1") fail("rerun is forbidden; use a new explicitly approved drill");
  if (!PROJECT.test(project ?? "") || !SOURCE.test(source ?? "") ||
      !INSTANCE.test(target ?? "") || target.length > 63 ||
      source === target || !/^[a-z]+-[a-z]+[0-9]+$/.test(region ?? "")) {
    fail("project, source, region and isolated kide-recovery-* target must be valid and distinct");
  }
  if (confirmation !== `RESTORE ${expectedSha} TO ${target}`) {
    fail("explicit clone confirmation must contain the full main SHA and new recovery target");
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(pointInTime ?? "")) {
    fail("point-in-time must be an absolute UTC RFC3339 timestamp");
  }
  const at = Date.parse(pointInTime);
  if (!Number.isFinite(at) || at > now - 60_000 || at < now - 7 * 86_400_000) {
    fail("point-in-time must be between one minute and seven days before execution");
  }
  return { expectedSha, project, source, target, region, pointInTime: new Date(at).toISOString() };
}

export function verifyRecoveryPreflight(source, listed, expected) {
  if (source?.name !== expected.source || source?.project !== expected.project ||
      source?.region !== expected.region || source?.state !== "RUNNABLE" ||
      !String(source?.databaseVersion ?? "").startsWith("POSTGRES_")) {
    fail("production source is not the expected runnable PostgreSQL instance");
  }
  const backup = source.settings?.backupConfiguration;
  if (backup?.enabled !== true || backup?.pointInTimeRecoveryEnabled !== true) {
    fail("source must have automated backups and PITR enabled");
  }
  if (!Array.isArray(listed) ||
      !listed.some((item) => item.name === expected.source) ||
      listed.some((item) => item.name === expected.target)) {
    fail("recovery target already exists or instance inventory is incomplete");
  }
  return true;
}

export function parseCloneOperation(response, expected) {
  if (typeof response?.name !== "string" || !/^[a-zA-Z0-9_-]+$/.test(response.name) ||
      response.operationType !== "CLONE" || response.targetId !== expected.target ||
      response.targetProject !== expected.project || response.error?.errors?.length) {
    fail("Cloud SQL did not return a valid clone operation for the approved target");
  }
  return response.name;
}

export function createRecoveryEvidence({ request, result, operationId, runId, actor, metadataFile, outputFile }) {
  if (result?.schemaVersion !== 1 || result?.operationId !== operationId ||
      result?.projectId !== request.project || result?.sourceInstance !== request.source ||
      result?.recoveryInstance !== request.target || result?.operationStatus !== "DONE" ||
      result?.recoveryState !== "RUNNABLE" || result?.recoveryDatabaseListed !== true) {
    fail("completed clone metadata does not match the approved source and target");
  }
  if (!/^[1-9][0-9]*$/.test(String(runId)) || !actor || !metadataFile || !outputFile) {
    fail("complete workflow provenance and metadata sidecar are required");
  }
  const metadataSha256 = createHash("sha256").update(readFileSync(metadataFile)).digest("hex");
  const payload = {
    schemaVersion: 1,
    commitSha: request.expectedSha,
    projectId: request.project,
    region: request.region,
    sourceInstance: request.source,
    recoveryInstance: request.target,
    pointInTime: request.pointInTime,
    cloneOperationId: operationId,
    completedAt: result.operationEndedAt,
    workflowRunId: String(runId),
    actor,
    metadataSha256,
    sourceAuditVerified: false,
    recoveredRowsVerified: false,
    productionModified: false,
    recoveryInstanceRetained: true,
    secretsCaptured: false,
  };
  writeFileSync(outputFile, JSON.stringify(payload, null, 2) + "\n");
  return payload;
}

// Read JSON exclusively from local files. Never accept unsigned user-supplied
// metadata as evidence of a completed cloud operation.
if (process.argv[1]?.endsWith("recovery-drill-policy.mjs")) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    const env = process.env;
    const request = {
      expectedSha: env.EXPECTED_COMMIT_SHA, dispatchedSha: env.GITHUB_SHA,
      mainSha: env.CURRENT_MAIN_SHA, gitRef: env.GITHUB_REF,
      attempt: env.GITHUB_RUN_ATTEMPT, source: env.GCP_CLOUD_SQL_INSTANCE,
      target: env.RECOVERY_TARGET, project: env.GCP_PROJECT_ID,
      region: env.GCP_REGION, pointInTime: env.RECOVERY_POINT_IN_TIME,
      confirmation: env.RECOVERY_CONFIRMATION,
    };
    const approved = authorizeRecovery(request);
    if (mode === "authorize") {
      console.log("Exact-main, bounded-PITR isolated recovery authorized.");
    } else if (mode === "preflight") {
      verifyRecoveryPreflight(JSON.parse(readFileSync(args[0], "utf8")),
        JSON.parse(readFileSync(args[1], "utf8")), approved);
      console.log("Cloud SQL source backups, PITR and unused recovery target verified.");
    } else if (mode === "operation") {
      process.stdout.write(parseCloneOperation(JSON.parse(readFileSync(args[0], "utf8")), approved) + "\n");
    } else if (mode === "evidence") {
      const metadataFile = args[0];
      createRecoveryEvidence({
        request: approved, result: JSON.parse(readFileSync(metadataFile, "utf8")),
        operationId: env.RECOVERY_OPERATION_ID, runId: env.GITHUB_RUN_ID,
        actor: env.GITHUB_ACTOR, metadataFile, outputFile: args[1],
      });
      console.log("Protected Cloud SQL clone and read-only metadata evidence retained.");
    } else {
      fail("unknown mode");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid recovery workflow");
    process.exitCode = 1;
  }
}

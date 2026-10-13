import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function fail(message) {
  throw new Error(`Protected recovery provenance rejected: ${message}`);
}

export function verifyRecoveryRun(run, proof, metadataBytes, expected) {
  if (!/^[0-9a-f]{40}$/.test(expected.sha ?? "") ||
      !/^[1-9][0-9]*$/.test(expected.runId ?? "") ||
      !/^[a-z][a-z0-9-]+$/.test(expected.target ?? "") ||
      !/^[a-zA-Z0-9_-]+$/.test(expected.operation ?? "")) {
    fail("expected SHA, run ID, target and operation must be explicit");
  }
  if (run?.id !== Number(expected.runId) ||
      run.name !== "Protected Cloud SQL recovery drill" ||
      !String(run.path ?? "").endsWith("/.github/workflows/production-recovery-drill.yml@refs/heads/main") ||
      run.event !== "workflow_dispatch" || run.head_branch !== "main" ||
      run.head_sha !== expected.sha || run.status !== "completed" ||
      run.conclusion !== "success" || run.run_attempt !== 1) {
    fail("recovery must be a successful, protected, first-attempt, exact-main workflow");
  }
  if (proof?.schemaVersion !== 1 || proof.commitSha !== expected.sha ||
      proof.workflowRunId !== expected.runId || proof.recoveryInstance !== expected.target ||
      proof.cloneOperationId !== expected.operation ||
      proof.recoveryInstanceRetained !== true || proof.productionModified !== false ||
      proof.secretsCaptured !== false || proof.sourceAuditVerified !== false ||
      proof.recoveredRowsVerified !== false) {
    fail("recovery artifact is missing or misstates independent operator evidence");
  }
  const sha = createHash("sha256").update(metadataBytes).digest("hex");
  if (proof.metadataSha256 !== sha) fail("completed Cloud SQL metadata sidecar was modified");
  let metadata;
  try {
    metadata = JSON.parse(metadataBytes.toString("utf8"));
  } catch {
    fail("invalid recovered Cloud SQL operation metadata JSON");
  }
  if (metadata.schemaVersion !== 1 ||
      metadata.projectId !== proof.projectId ||
      metadata.sourceInstance !== proof.sourceInstance ||
      metadata.recoveryInstance !== expected.target ||
      metadata.operationId !== expected.operation ||
      metadata.operationType !== "CLONE" || metadata.operationStatus !== "DONE" ||
      metadata.recoveryDatabaseListed !== true || metadata.backupConfigured !== true ||
      metadata.pitrConfigured !== true ||
      metadata.contentQueriesVerified !== false || metadata.sourceRequestVerified !== false) {
    fail("Cloud SQL metadata is incomplete, inconsistent or falsely attests source/row integrity");
  }
  return { sha: expected.sha, runId: expected.runId, target: expected.target };
}

if (process.argv[1]?.endsWith("verify-recovery-run.mjs")) {
  try {
    const [runFile, proofFile, metadataFile, sha, runId, target, operation] = process.argv.slice(2);
    if ([runFile, proofFile, metadataFile, sha, runId, target, operation].some((x) => !x)) {
      fail("all run, artifact, metadata and identity arguments are required");
    }
    verifyRecoveryRun(
      JSON.parse(readFileSync(runFile, "utf8")),
      JSON.parse(readFileSync(proofFile, "utf8")),
      readFileSync(metadataFile),
      { sha, runId, target, operation },
    );
    console.log("Verified protected same-SHA recovery workflow, artifact and metadata hashes.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid recovery artifact");
    process.exitCode = 1;
  }
}

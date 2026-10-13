/* eslint-disable prettier/prettier -- Existing release-check scripts use hand-formatted multi-line security guard clauses. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  authorizeRecovery,
  verifyRecoveryApproval,
  verifyRecoveryPreflight,
  parseCloneOperation,
  createRecoveryEvidence,
} from "../launch/recovery-drill-policy.mjs";
import { verifyRecoveryRun } from "../launch/verify-recovery-run.mjs";

const sha = "1234567890abcdef1234567890abcdef12345678";
const now = Date.parse("2026-10-13T05:00:00.000Z");
const request = {
  expectedSha: sha,
  dispatchedSha: sha,
  mainSha: sha,
  gitRef: "refs/heads/main",
  attempt: "1",
  source: "kide-web-app",
  target: "kide-recovery-20261013",
  project: "sample-production-project",
  region: "us-central1",
  pointInTime: "2026-10-13T04:55:00.000Z",
  confirmation: `RESTORE ${sha} TO kide-recovery-20261013`,
};
const update = (value, change) => ({ ...value, ...change });
function rejects(label, callback) {
  assert.throws(callback, /rejected:/i, label);
}
assert.equal(verifyRecoveryApproval([
  { state: "approved", user: { login: "another-reviewer" } },
], "operator"), true);
rejects("no protected review", () => verifyRecoveryApproval([], "operator"));
rejects("self review", () => verifyRecoveryApproval([
  { state: "approved", user: { login: "operator" } },
], "operator"));
rejects("pending review", () => verifyRecoveryApproval([
  { state: "pending", user: { login: "another-reviewer" } },
], "operator"));
const approved = authorizeRecovery(request, now);
assert.equal(approved.target, request.target);
for (const [name, change] of [
  ["wrong SHA", { mainSha: "0".repeat(40) }],
  ["wrong branch", { gitRef: "refs/heads/release" }],
  ["replay", { attempt: "2" }],
  ["destination is production", { target: "kide-web-app" }],
  ["unapproved name", { target: "test-clone" }],
  ["wrong confirmation", { confirmation: "RESTORE" }],
  ["point in future", { pointInTime: "2026-10-13T05:15:00.000Z" }],
  ["outside retention", { pointInTime: "2026-09-30T05:00:00.000Z" }],
  ["bad timestamp", { pointInTime: "tomorrow" }],
  ["wrong project", { project: "; dangerous" }],
]) {
  rejects(name, () => authorizeRecovery(update(request, change), now));
}
const source = {
  name: approved.source,
  project: approved.project,
  region: approved.region,
  state: "RUNNABLE",
  databaseVersion: "POSTGRES_17",
  settings: { backupConfiguration: { enabled: true, pointInTimeRecoveryEnabled: true } },
};
const list = [{ name: approved.source }];
assert.equal(verifyRecoveryPreflight(source, list, approved), true);
rejects("clone already exists", () =>
  verifyRecoveryPreflight(source, [...list, { name: approved.target }], approved),
);
rejects("PITR missing", () =>
  verifyRecoveryPreflight(update(source, {
    settings: { backupConfiguration: { enabled: true, pointInTimeRecoveryEnabled: false } },
  }), list, approved),
);
rejects("wrong source project", () =>
  verifyRecoveryPreflight(update(source, { project: "another-project" }), list, approved),
);
const op = {
  name: "operation-123",
  operationType: "CLONE",
  targetId: approved.target,
  targetProject: approved.project,
};
assert.equal(parseCloneOperation(op, approved), op.name);
for (const change of [
  { operationType: "UPDATE" },
  { targetId: approved.source },
  { targetProject: "wrong" },
  { error: { errors: [{ message: "failed" }] } },
]) {
  rejects("wrong clone operation", () => parseCloneOperation(update(op, change), approved));
}
const dir = mkdtempSync(join(tmpdir(), "kide-recovery-policy-"));
try {
  const result = {
    schemaVersion: 1,
    operationId: op.name,
    projectId: approved.project,
    sourceInstance: approved.source,
    recoveryInstance: approved.target,
    operationStatus: "DONE",
    operationType: "CLONE",
    operationEndedAt: new Date(now).toISOString(),
    backupConfigured: true,
    pitrConfigured: true,
    recoveryState: "RUNNABLE",
    recoveryDatabaseListed: true,
    contentQueriesVerified: false,
    sourceRequestVerified: false,
  };
  const file = join(dir, "verified-clone.json");
  const output = join(dir, "evidence.json");
  writeFileSync(file, JSON.stringify(result));
  const evidence = createRecoveryEvidence({
    request: approved,
    result,
    operationId: op.name,
    runId: "762945",
    actor: "operator",
    metadataFile: file,
    outputFile: output,
  });
  const workflow = {
    id: 762945,
    name: "Protected Cloud SQL recovery drill",
    path: "example/repository/.github/workflows/production-recovery-drill.yml@refs/heads/main",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: sha,
    status: "completed",
    conclusion: "success",
    run_attempt: 1,
  };
  const expected = {
    sha,
    runId: "762945",
    target: approved.target,
    operation: op.name,
  };
  assert.equal(
    verifyRecoveryRun(workflow, evidence, readFileSync(file), expected).runId,
    "762945",
  );
  rejects("wrong run SHA", () =>
    verifyRecoveryRun(update(workflow, { head_sha: "0".repeat(40) }), evidence,
      readFileSync(file), expected),
  );
  rejects("self-created run path", () =>
    verifyRecoveryRun(update(workflow, { path: "other.yml" }), evidence,
      readFileSync(file), expected),
  );
  rejects("unapproved rerun", () =>
    verifyRecoveryRun(update(workflow, { run_attempt: 2 }), evidence,
      readFileSync(file), expected),
  );
  rejects("altered metadata", () =>
    verifyRecoveryRun(workflow, evidence, Buffer.from("{}"), expected),
  );
  rejects("falsified SQL signoff", () =>
    verifyRecoveryRun(workflow, update(evidence, { recoveredRowsVerified: true }),
      readFileSync(file), expected),
  );
  const forged = { ...result, sourceRequestVerified: true };
  const forgedBytes = Buffer.from(JSON.stringify(forged));
  const forgedProof = {
    ...evidence,
    metadataSha256: createHash("sha256").update(forgedBytes).digest("hex"),
  };
  rejects("false Cloud Audit proof", () =>
    verifyRecoveryRun(workflow, forgedProof, forgedBytes, expected),
  );
  assert.equal(JSON.parse(readFileSync(output, "utf8")).secretsCaptured, false);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log("Protected recovery authorization, PITR, duplicate target and provenance tests passed.");

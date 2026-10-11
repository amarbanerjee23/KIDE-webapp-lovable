import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const sha = "1234567890abcdef1234567890abcdef12345678";
const repository = "amarbanerjee23/KIDE-webapp-lovable";
const qualification = "125678";
const workflowId = "789123";
const actor = "kide-operator";
const url = (label) => `https://github.com/${repository}/issues/${label}`;
const validator = fileURLToPath(new URL("../release/verify-operations-approval.mjs", import.meta.url));
const creator = fileURLToPath(new URL("../release/create-operations-approval.mjs", import.meta.url));
const folder = mkdtempSync(join(tmpdir(), "kide-operations-approval-"));
const evidenceFile = join(folder, "approval.json");
const runFile = join(folder, "run.json");
const reviewsFile = join(folder, "reviews.json");

const valid = {
  schemaVersion: 1,
  releaseVersion: "1.0.0",
  commitSha: sha,
  repository,
  qualificationRunId: qualification,
  workflowRunId: workflowId,
  runAttempt: 1,
  actor,
  attestedAt: new Date().toISOString(),
  confirmed: true,
  secretsCaptured: false,
  evidenceReferences: {
    restoreSqlInspection: url(101),
    cloneSourceAudit: url(102),
    monitoringAlertAndRollback: url(103),
    privacyTermsApproval: url(104),
    OpenIncidentReview: url(105),
  },
};
const goodRun = {
  id: Number(workflowId),
  name: "Production operations release approval",
  path: `${repository}/.github/workflows/operations-approval.yml@refs/heads/main`,
  event: "workflow_dispatch",
  head_branch: "main",
  head_sha: sha,
  status: "completed",
  conclusion: "success",
  run_attempt: 1,
  actor: { login: actor },
};
const goodReviews = [
  { state: "approved", user: { login: "independent-release-reviewer" } },
];

function runNode(script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: folder,
    encoding: "utf8",
    ...options,
  });
}
function validate(item = valid, run = goodRun, reviews = goodReviews, withReview = true) {
  writeFileSync(evidenceFile, JSON.stringify(item));
  writeFileSync(runFile, JSON.stringify(run));
  writeFileSync(reviewsFile, JSON.stringify(reviews));
  return runNode(validator, [
    evidenceFile, sha, qualification, repository,
    ...(withReview ? [runFile, reviewsFile] : []),
  ]);
}
function assertReject(label, item = valid, run = goodRun, reviews = goodReviews) {
  const result = validate(item, run, reviews);
  if (result.status === 0 || !result.stderr.includes("Release operations approval rejected")) {
    throw new Error(`${label}: must fail closed with expected diagnostic: ${result.stderr}`);
  }
}
function changed(subject, update) {
  const value = structuredClone(subject);
  update(value);
  return value;
}
try {
  const baseline = validate();
  if (baseline.status !== 0) throw new Error(`valid independent approval failed: ${baseline.stderr}`);
  if (validate(valid, goodRun, goodReviews, false).status !== 0) {
    throw new Error("attestation generation precheck must accept structurally valid evidence");
  }

  assertReject("wrong commit", changed(valid, (x) => { x.commitSha = "0".repeat(40); }));
  assertReject("wrong qualified run", changed(valid, (x) => { x.qualificationRunId = "999"; }));
  assertReject("wrong repository", changed(valid, (x) => { x.repository = "other/repository"; }));
  assertReject("missing recovery SQL evidence", changed(valid, (x) => { delete x.evidenceReferences.restoreSqlInspection; }));
  assertReject("placeholder evidence", changed(valid, (x) => { x.evidenceReferences.privacyTermsApproval = "https://example.com/docs"; }));
  assertReject("credential-bearing URL", changed(valid, (x) => { x.evidenceReferences.cloneSourceAudit = "https://user:secret@github.com/issues/1"; }));
  assertReject("query token", changed(valid, (x) => { x.evidenceReferences.monitoringAlertAndRollback = url(100) + "?token=secret"; }));
  assertReject("stale attestation", changed(valid, (x) => { x.attestedAt = "2020-01-01T00:00:00Z"; }));
  assertReject("incomplete self-attestation", changed(valid, (x) => { x.confirmed = false; }));
  assertReject("wrong release workflow", valid, changed(goodRun, (x) => { x.name = "CI"; }));
  assertReject("wrong workflow path", valid, changed(goodRun, (x) => { x.path = "other.yml"; }));
  assertReject("wrong GH commit", valid, changed(goodRun, (x) => { x.head_sha = "0".repeat(40); }));
  assertReject("wrong GH branch", valid, changed(goodRun, (x) => { x.head_branch = "release/test"; }));
  assertReject("unsuccessful approval", valid, changed(goodRun, (x) => { x.conclusion = "failure"; }));
  assertReject("pending approval", valid, changed(goodRun, (x) => { x.status = "in_progress"; }));
  assertReject("wrong GH run identity", valid, changed(goodRun, (x) => { x.id = 112233; }));
  assertReject("wrong run initiator", valid, changed(goodRun, (x) => { x.actor.login = "unrelated"; }));
  assertReject("rerun of old review", valid, changed(goodRun, (x) => { x.run_attempt = 2; }));
  assertReject("no approval event", valid, goodRun, []);
  assertReject("self approval", valid, goodRun, [{ state: "approved", user: { login: actor } }]);
  assertReject("pending review", valid, goodRun, [{ state: "pending", user: { login: "second-person" } }]);

  const baseEnv = {
    ...process.env,
    GITHUB_SHA: sha,
    GITHUB_REF: "refs/heads/main",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_REPOSITORY: repository,
    GITHUB_RUN_ID: workflowId,
    GITHUB_ACTOR: actor,
    RELEASE_QUALIFICATION_RUN_ID: qualification,
    RELEASE_APPROVAL_CONFIRMATION: `APPROVE v1.0.0 ${sha}`,
    RESTORE_SQL_INSPECTION_URL: url(101),
    CLONE_SOURCE_AUDIT_URL: url(102),
    MONITORING_ROLLBACK_URL: url(103),
    PRIVACY_TERMS_APPROVAL_URL: url(104),
    INCIDENT_REVIEW_URL: url(105),
  };
  const created = runNode(creator, [], { env: baseEnv });
  if (created.status !== 0) throw new Error(`valid sign-off creation failed: ${created.stderr}`);
  const emitted = JSON.parse(
    readFileSync(join(folder, "operations-approval", `release-operations-approval-${sha}.json`), "utf8"),
  );
  if (validate(emitted).status !== 0) throw new Error("generated approval was rejected");
  const refused = runNode(creator, [], {
    env: { ...baseEnv, RELEASE_APPROVAL_CONFIRMATION: "APPROVE v1.0.0" },
  });
  if (refused.status === 0) throw new Error("creator accepted weak non-SHA confirmation");
  console.log("Independent operations approval: valid flow and 22 fail-closed cases passed.");
} finally {
  rmSync(folder, { recursive: true, force: true });
}

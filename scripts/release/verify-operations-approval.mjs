import { readFileSync } from "node:fs";

const [, , evidencePath, expectedCommit, expectedQualificationId, expectedRepository, runPath, reviewsPath] =
  process.argv;

function fail(message) {
  throw new Error(`Release operations approval rejected: ${message}`);
}
function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}
function positiveId(value) {
  return /^(?:[1-9][0-9]*)$/.test(String(value ?? ""));
}
function evidenceUrl(value, name) {
  if (typeof value !== "string" || value.length > 2048) fail(`${name} must be an evidence URL`);
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${name} must be an HTTPS evidence URL`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    url.pathname === "/" ||
    /^(?:example\.com|localhost|127\.0\.0\.1)$/i.test(url.hostname)
  ) {
    fail(`${name} must be a traceable HTTPS reference without credentials or query strings`);
  }
}
if (!evidencePath || !/^[0-9a-f]{40}$/.test(expectedCommit ?? "") ||
    !positiveId(expectedQualificationId) || !/^[\w.-]+\/[\w.-]+$/.test(expectedRepository ?? "")) {
  fail("expected JSON path, full commit SHA, qualification run ID, repository");
}
const evidence = record(JSON.parse(readFileSync(evidencePath, "utf8")), "evidence");
if (evidence.schemaVersion !== 1 || evidence.releaseVersion !== "1.0.0") {
  fail("unsupported approval schema or release version");
}
if (evidence.commitSha !== expectedCommit ||
    String(evidence.qualificationRunId) !== expectedQualificationId ||
    evidence.repository !== expectedRepository) {
  fail("approval commit, qualification run or repository does not match release");
}
if (!positiveId(evidence.workflowRunId) || evidence.runAttempt !== 1 ||
    typeof evidence.actor !== "string" || !/^[a-zA-Z0-9-]{1,39}$/.test(evidence.actor)) {
  fail("approval workflow identity is invalid");
}
const signedAt = Date.parse(evidence.attestedAt ?? "");
if (!Number.isFinite(signedAt) || signedAt > Date.now() + 300000 ||
    signedAt < Date.now() - 30 * 24 * 3600000) {
  fail("approval is missing a recent attestation time");
}
if (evidence.confirmed !== true || evidence.secretsCaptured !== false) {
  fail("approval must explicitly confirm clean non-secret evidence");
}
const refs = record(evidence.evidenceReferences, "evidenceReferences");
for (const key of [
  "restoreSqlInspection",
  "cloneSourceAudit",
  "monitoringAlertAndRollback",
  "privacyTermsApproval",
  "OpenIncidentReview",
]) {
  evidenceUrl(refs[key], key);
}

if (runPath || reviewsPath) {
  if (!runPath || !reviewsPath) fail("run and independent reviewer proof are both required");
  const run = record(JSON.parse(readFileSync(runPath, "utf8")), "workflow run");
  const reviews = JSON.parse(readFileSync(reviewsPath, "utf8"));
  if (!Array.isArray(reviews)) fail("GitHub workflow reviews must be an array");
  if (run.name !== "Production operations release approval" ||
      run.event !== "workflow_dispatch" ||
      run.head_branch !== "main" ||
      run.head_sha !== expectedCommit ||
      run.status !== "completed" ||
      run.conclusion !== "success" ||
      run.run_attempt !== 1 ||
      String(run.id) !== String(evidence.workflowRunId) ||
      run.actor?.login !== evidence.actor ||
      !String(run.path ?? "").split("@")[0].endsWith("/operations-approval.yml")) {
    fail("GitHub operations approval run is missing, stale, unsuccessful or mismatched");
  }
  const independent = reviews.some(
    (review) =>
      String(review.state ?? "").toLowerCase() === "approved" &&
      typeof review.user?.login === "string" &&
      review.user.login.toLowerCase() !== evidence.actor.toLowerCase(),
  );
  if (!independent) fail("a different GitHub reviewer must approve the protected environment");
}
console.log("Production operations sign-off is bound to the exact qualified release commit.");

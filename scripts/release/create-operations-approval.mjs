import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function requireEnv(key) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing approval value: ${key}`);
  return value;
}
const sha = requireEnv("GITHUB_SHA");
const version = "1.0.0";
if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("Full main SHA required");
if (requireEnv("GITHUB_REF") !== "refs/heads/main") throw new Error("Only main may be approved");
if (requireEnv("GITHUB_RUN_ATTEMPT") !== "1") throw new Error("Reruns require fresh dispatch and review");
if (requireEnv("RELEASE_APPROVAL_CONFIRMATION") !== `APPROVE v${version} ${sha}`) {
  throw new Error("Type exact release version and commit in approval confirmation");
}
const payload = {
  schemaVersion: 1,
  releaseVersion: version,
  commitSha: sha,
  repository: requireEnv("GITHUB_REPOSITORY"),
  qualificationRunId: requireEnv("RELEASE_QUALIFICATION_RUN_ID"),
  workflowRunId: requireEnv("GITHUB_RUN_ID"),
  runAttempt: 1,
  actor: requireEnv("GITHUB_ACTOR"),
  attestedAt: new Date().toISOString(),
  confirmed: true,
  secretsCaptured: false,
  evidenceReferences: {
    restoreSqlInspection: requireEnv("RESTORE_SQL_INSPECTION_URL"),
    cloneSourceAudit: requireEnv("CLONE_SOURCE_AUDIT_URL"),
    monitoringAlertAndRollback: requireEnv("MONITORING_ROLLBACK_URL"),
    privacyTermsApproval: requireEnv("PRIVACY_TERMS_APPROVAL_URL"),
    OpenIncidentReview: requireEnv("INCIDENT_REVIEW_URL"),
  },
};
const output = join("operations-approval", `release-operations-approval-${sha}.json`);
mkdirSync("operations-approval", { recursive: true });
writeFileSync(output, JSON.stringify(payload, null, 2) + "\n");
console.log(`Approval evidence created: ${output}`);

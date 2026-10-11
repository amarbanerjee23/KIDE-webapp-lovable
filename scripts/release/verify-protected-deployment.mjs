import { readFileSync } from "node:fs";

function fail(reason) {
  throw new Error(`Protected deployment provenance rejected: ${reason}`);
}
function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${name} is required`);
  return value;
}
const [acceptancePath, deploymentPath, runPath, expectedSha, expectedRunId, repository] =
  process.argv.slice(2);
if (![acceptancePath, deploymentPath, runPath, expectedSha, expectedRunId, repository].every(Boolean) ||
    !/^[a-f0-9]{40}$/.test(expectedSha ?? "") ||
    !/^[1-9][0-9]*$/.test(expectedRunId ?? "") ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")) {
  fail("requires acceptance, deployment artifact, GitHub run, full SHA, run ID and repository");
}
const acceptance = object(JSON.parse(readFileSync(acceptancePath, "utf8")), "acceptance");
const verified = object(JSON.parse(readFileSync(deploymentPath, "utf8")), "protected deployment");
const run = object(JSON.parse(readFileSync(runPath, "utf8")), "deployment workflow run");

if (acceptance.commitSha !== expectedSha || acceptance.branch !== "main" ||
    acceptance.deployment?.commitSha !== expectedSha) {
  fail("production qualification must be bound to the exact main commit");
}
if (run.name !== "Deploy production from approved main" ||
    run.event !== "workflow_dispatch" ||
    run.head_branch !== "main" ||
    run.head_sha !== expectedSha ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    run.run_attempt !== 1 ||
    String(run.id) !== expectedRunId ||
    !String(run.path ?? "").split("@")[0].endsWith("/.github/workflows/deploy-production.yml") ||
    (run.repository?.full_name && run.repository.full_name !== repository)) {
  fail("the protected production deployment run is missing, failed or from a different source");
}
if (verified.schemaVersion !== 1 || verified.commitSha !== expectedSha ||
    verified.authDeploymentState !== "configured" ||
    verified.trafficPercent !== 100 ||
    verified.secretsCaptured !== false) {
  fail("the protected deployment artifact is invalid or not authentication-ready");
}
const live = object(acceptance.deployment, "qualified live deployment");
for (const field of [
  "schemaVersion",
  "commitSha",
  "projectId",
  "region",
  "serviceName",
  "serviceUrl",
  "buildImage",
  "latestReadyRevision",
  "revisionImage",
  "imageDigest",
  "registryImageDigest",
  "cloudSqlConnection",
  "authDeploymentState",
  "trafficPercent",
  "secretsCaptured",
]) {
  if (verified[field] !== live[field]) {
    fail(`protected deployment and independently qualified live production disagree: ${field}`);
  }
}
if (verified.serviceUrl !== acceptance.productionOrigin ||
    !/^sha256:[a-f0-9]{64}$/.test(String(verified.imageDigest ?? "")) ||
    verified.registryImageDigest !== verified.imageDigest ||
    !String(verified.buildImage).endsWith(`:${expectedSha}`)) {
  fail("deployed origin, immutable image digest or commit image tag is inconsistent");
}
console.log(`Protected deployment run ${expectedRunId} matches accepted live SHA ${expectedSha}`);

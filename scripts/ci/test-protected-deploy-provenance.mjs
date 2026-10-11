import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const RUN = "438123";
const REPO = "amarbanerjee23/KIDE-webapp-lovable";
const HASH = "a".repeat(64);
const validator = fileURLToPath(new URL("../release/verify-protected-deployment.mjs", import.meta.url));
const mainGuard = fileURLToPath(new URL("../release/require-current-main.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "kide-deploy-provenance-"));
const acceptancePath = join(dir, "acceptance.json");
const deployPath = join(dir, "deployment.json");
const runPath = join(dir, "run.json");
const qualified = {
  schemaVersion: 1,
  commitSha: SHA,
  projectId: "test-project",
  region: "us-central1",
  serviceName: "kide-webapp",
  serviceUrl: "https://kide.example.test",
  buildImage: `us-central1-docker.pkg.dev/test-project/kide/kide-webapp:${SHA}`,
  latestReadyRevision: "kide-webapp-00124-abc",
  revisionImage: `us-central1-docker.pkg.dev/test-project/kide/kide-webapp@sha256:${HASH}`,
  imageDigest: `sha256:${HASH}`,
  registryImageDigest: `sha256:${HASH}`,
  cloudSqlConnection: "test-project:us-central1:kide-web-app",
  authDeploymentState: "configured",
  trafficPercent: 100,
  secretsCaptured: false,
};
const acceptance = {
  schemaVersion: 2, branch: "main", commitSha: SHA,
  productionOrigin: qualified.serviceUrl, deployment: qualified,
};
const deploymentRun = {
  id: Number(RUN), name: "Deploy production from approved main",
  event: "workflow_dispatch", head_branch: "main", head_sha: SHA,
  status: "completed", conclusion: "success", run_attempt: 1,
  path: `${REPO}/.github/workflows/deploy-production.yml@refs/heads/main`,
  repository: { full_name: REPO },
};
const clone = (x) => structuredClone(x);
function check(a = acceptance, d = qualified, r = deploymentRun, sha = SHA, runId = RUN) {
  writeFileSync(acceptancePath, JSON.stringify(a));
  writeFileSync(deployPath, JSON.stringify(d));
  writeFileSync(runPath, JSON.stringify(r));
  return spawnSync(process.execPath,
    [validator, acceptancePath, deployPath, runPath, sha, runId, REPO],
    { encoding: "utf8" });
}
function reject(label, a, d, r, sha, runId) {
  const response = check(a, d, r, sha, runId);
  if (response.status === 0 ||
      !response.stderr.includes("Protected deployment provenance rejected")) {
    throw new Error(`${label} must reject with a provenance error: ${response.stderr}`);
  }
}
function mutate(item, field, value) {
  const copy = clone(item);
  copy[field] = value;
  return copy;
}
function guard(head = SHA, dispatched = SHA, tip = SHA, ref = "refs/heads/main") {
  return spawnSync(process.execPath, [mainGuard, head, dispatched, tip, ref], { encoding: "utf8" });
}
try {
  if (check().status !== 0) throw new Error("valid protected deployment failed");
  reject("PR-only deployment", acceptance, qualified, mutate(deploymentRun, "event", "pull_request"));
  reject("unprotected workflow identity", acceptance, qualified, mutate(deploymentRun, "path", "other.yml"));
  reject("wrong workflow name", acceptance, qualified, mutate(deploymentRun, "name", "CI"));
  reject("stale workflow SHA", acceptance, qualified, mutate(deploymentRun, "head_sha", "0".repeat(40)));
  reject("wrong branch", acceptance, qualified, mutate(deploymentRun, "head_branch", "release/test"));
  reject("unsuccessful run", acceptance, qualified, mutate(deploymentRun, "conclusion", "failure"));
  reject("running deploy", acceptance, qualified, mutate(deploymentRun, "status", "in_progress"));
  reject("rerun without fresh approval", acceptance, qualified, mutate(deploymentRun, "run_attempt", 2));
  reject("incorrect run ID", acceptance, qualified, mutate(deploymentRun, "id", 999));
  reject("other repository", acceptance, qualified, mutate(deploymentRun, "repository", { full_name: "other/repo" }));
  reject("missing deploy blob", acceptance, {}, deploymentRun);
  reject("wrong image", acceptance, mutate(qualified, "imageDigest", "sha256:" + "b".repeat(64)), deploymentRun);
  reject("wrong revision", acceptance, mutate(qualified, "latestReadyRevision", "old-revision"), deploymentRun);
  reject("wrong Cloud SQL", acceptance, mutate(qualified, "cloudSqlConnection", "wrong"), deploymentRun);
  reject("wrong project", acceptance, mutate(qualified, "projectId", "wrong"), deploymentRun);
  reject("wrong auth config", acceptance, mutate(qualified, "authDeploymentState", "disabled"), deploymentRun);
  reject("less than full traffic", acceptance, mutate(qualified, "trafficPercent", 50), deploymentRun);
  reject("wrong origin", acceptance, mutate(qualified, "serviceUrl", "https://other.example.test"), deploymentRun);
  reject("stale acceptance SHA", mutate(acceptance, "commitSha", "0".repeat(40)), qualified, deploymentRun);
  reject("non-main acceptance", mutate(acceptance, "branch", "feature"), qualified, deploymentRun);
  reject("wrong requested run", acceptance, qualified, deploymentRun, SHA, "999");
  reject("wrong requested sha", acceptance, qualified, deploymentRun, "0".repeat(40));

  if (guard().status !== 0) throw new Error("current-main release tip guard should accept exact match");
  for (const [label, args] of [
    ["branch drift", [SHA, SHA, SHA, "refs/heads/feature"]],
    ["main moved", [SHA, SHA, "0".repeat(40)]],
    ["checkout changed", [SHA, "0".repeat(40), SHA]],
    ["invalid SHA", [SHA, "not-a-sha", SHA]],
  ]) {
    const r = guard(...args);
    if (r.status === 0 || !r.stderr.includes("Release main-head guard rejected")) {
      throw new Error(`${label} should fail: ${r.stderr}`);
    }
  }
  console.log("Protected release deployment provenance and fresh-main tests passed.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

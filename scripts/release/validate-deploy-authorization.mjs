import { readFileSync } from "node:fs";

const FULL_SHA = /^[0-9a-f]{40}$/;

function reject(message) {
  throw new Error(`Production deployment authorization rejected: ${message}`);
}

export function validateDeploymentAuthorization(context, actions) {
  const expected = context.expectedCommitSha ?? "";
  const dispatched = context.dispatchedCommitSha ?? "";
  const main = context.currentMainSha ?? "";

  if (context.githubRef !== "refs/heads/main") {
    reject("workflow must be dispatched from main");
  }
  // Fail with the exact invalid field, not an ambiguous shared SHA error.
  // These are public commit IDs, so displaying the verified main SHA is safe.
  if (!FULL_SHA.test(main)) {
    reject("git fetch did not provide a valid 40-character lowercase current main SHA");
  }
  if (!FULL_SHA.test(dispatched)) {
    reject("GitHub's dispatched commit is not a valid 40-character lowercase SHA");
  }
  if (!FULL_SHA.test(expected)) {
    reject(
      `expected_commit_sha must be exactly 40 lowercase hexadecimal characters ` +
        `(received ${expected.length}). Enter current main SHA: ${main}`,
    );
  }
  if (expected !== main || dispatched !== main) {
    reject(`the confirmed, dispatched and current main SHAs must agree; current main is ${main}`);
  }
  if (context.confirmation !== `DEPLOY ${main}`) {
    reject(`confirmation must be exactly: DEPLOY ${main}`);
  }
  const runs = actions?.workflow_runs;
  if (!Array.isArray(runs)) {
    reject("GitHub Actions workflow run data is missing");
  }
  const qualified = runs.some(
    (run) =>
      run?.name === "CI" &&
      run?.head_branch === "main" &&
      run?.head_sha === main &&
      run?.event === "push" &&
      run?.status === "completed" &&
      run?.conclusion === "success",
  );
  if (!qualified) {
    reject("successful post-merge main CI is required for the exact deploy SHA");
  }
  return { commitSha: main, mainCiVerified: true };
}

if (process.argv[1]?.endsWith("validate-deploy-authorization.mjs")) {
  try {
    const path = process.argv[2];
    if (!path) reject("pass the GitHub Actions runs JSON file");
    const result = validateDeploymentAuthorization(
      {
        expectedCommitSha: process.env.EXPECTED_COMMIT_SHA,
        dispatchedCommitSha: process.env.GITHUB_SHA,
        currentMainSha: process.env.CURRENT_MAIN_SHA,
        githubRef: process.env.GITHUB_REF,
        confirmation: process.env.DEPLOY_CONFIRMATION,
      },
      JSON.parse(readFileSync(path, "utf8")),
    );
    console.log(`Production deploy authorized for ${result.commitSha}; main CI verified.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid deployment authorization.");
    process.exitCode = 1;
  }
}

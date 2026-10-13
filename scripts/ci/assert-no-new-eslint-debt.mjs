#!/usr/bin/env node
// Every tracked source is linted on both the candidate and the frozen PR90
// baseline. New error-level debt fails; existing independent formatting debt
// remains visible, without causing unrelated release hardening to rewrite it.
import fs from "node:fs";
import path from "node:path";

const [currentFile, baselineFile, currentRoot, baselineRoot] = process.argv.slice(2);
if (!currentFile || !baselineFile || !currentRoot || !baselineRoot) {
  throw new Error("Usage: assert-no-new-eslint-debt.mjs CURRENT BASELINE CURRENT_ROOT BASE_ROOT");
}

function load(reportFile, root) {
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  if (!Array.isArray(report)) throw new Error(`Invalid ESLint JSON report: ${reportFile}`);
  const counts = new Map();
  let errors = 0;
  for (const file of report) {
    const fileName = path.relative(root, file.filePath).replaceAll(path.sep, "/");
    if (fileName.startsWith("../") || path.isAbsolute(fileName)) {
      throw new Error(`ESLint reported an unexpected file outside checkout: ${file.filePath}`);
    }
    for (const message of file.messages ?? []) {
      if (message.severity !== 2) continue;
      errors += 1;
      const key = JSON.stringify([fileName, message.ruleId ?? "fatal"]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return { counts, errors };
}

const baseline = load(baselineFile, baselineRoot);
const current = load(currentFile, currentRoot);
const regressions = [];
for (const [key, count] of current.counts) {
  const allowed = baseline.counts.get(key) ?? 0;
  if (count > allowed) {
    const [file, rule] = JSON.parse(key);
    regressions.push(`${file} [${rule}]: ${count} errors vs baseline ${allowed}`);
  }
}
console.log(
  `Full-repository ESLint: pre-PR91 ${baseline.errors} existing errors; candidate ${current.errors} errors.`,
);
if (regressions.length > 0) {
  console.error("New ESLint errors are not permitted:");
  for (const regression of regressions) console.error(` - ${regression}`);
  process.exitCode = 1;
} else {
  console.log("PASS: no new lint errors in any file/rule relative to frozen baseline.");
}

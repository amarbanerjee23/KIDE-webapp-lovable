import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { EXAMPLE_WORKSPACES, linkWorkspace } from "../../src/lib/dsl";
import { CODEGEN_TARGETS, generateCode } from "../../src/lib/kide/codegen";
import { synthesize } from "../../src/lib/kide/synthesis";

const out = process.argv[2];
if (!out) throw new Error("Usage: bun scripts/ci/emit-codegen-fixture.ts <output-dir>");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const example = EXAMPLE_WORKSPACES[0]!;
const workspace = linkWorkspace(example.files.map((file) => ({ ...file })));
const report = synthesize(workspace);
if (!report.ready || !report.candidates[0]) {
  throw new Error("Reference workspace did not synthesize.");
}

for (const target of CODEGEN_TARGETS) {
  const bundle = generateCode(workspace, report.candidates[0], target);
  if (!bundle.validation.ready) {
    throw new Error(`${target} code generation failed: ${bundle.validation.errors.join("; ")}`);
  }
  for (const artifact of bundle.artifacts) {
    const path = join(out, artifact.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, artifact.content, "utf8");
  }
}

console.log(out);

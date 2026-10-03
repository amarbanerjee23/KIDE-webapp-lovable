import { describe, expect, it } from "vitest";
import {
  EXAMPLE_WORKSPACES,
  linkWorkspace,
  parseMnc,
  type ExampleWorkspace,
  type WorkspaceFile,
} from "@/lib/dsl";
import {
  approvalFingerprint,
  approvalIsCurrentForSynthesisContext,
  type Approval,
} from "./approval-store";
import { buildAssurance } from "./assurance";
import { qualify } from "./qualification";
import { buildRelease } from "./release";
import { sha256 } from "./sha256";
import { synthesize } from "./synthesis";

function linked(example: ExampleWorkspace) {
  return linkWorkspace(example.files.map((file) => ({ ...file })));
}

function sourceInterfaces(example: ExampleWorkspace) {
  const workspace = linked(example);
  const interfaces = new Set<string>();
  for (const file of workspace.files) {
    if (file.result.ast?.node !== "Model") continue;
    for (const iface of file.result.ast.interfaces) interfaces.add(iface.name);
  }
  return interfaces;
}

describe("release-hardening example matrix", () => {
  it("keeps the explicit reference library broad", () => {
    expect(EXAMPLE_WORKSPACES).toHaveLength(10);
    expect(new Set(EXAMPLE_WORKSPACES.map((example) => example.domain)).size).toBe(10);
    expect(EXAMPLE_WORKSPACES.every((example) => example.files.length === 5)).toBe(true);
  });

  for (const example of EXAMPLE_WORKSPACES) {
    describe(`${example.domain}: ${example.title}`, () => {
      it("parses and links every source model without errors", () => {
        const workspace = linked(example);
        expect(workspace.files).toHaveLength(5);
        expect(workspace.errorCount).toBe(0);
        expect(workspace.files.every((file) => file.result.ast !== null)).toBe(true);
      });

      it("synthesizes deterministic, independently valid MNC candidates", () => {
        const workspace = linked(example);
        const first = synthesize(workspace);
        const second = synthesize(linked(example));

        expect(first.ready).toBe(true);
        expect(first.blockedReason).toBeNull();
        expect(first.candidates).toHaveLength(3);
        expect(JSON.stringify(first)).toBe(JSON.stringify(second));

        const declaredInterfaces = sourceInterfaces(example);
        for (const candidate of first.candidates) {
          expect(candidate.generatedMnc.trim().length).toBeGreaterThan(0);
          expect(candidate.validation.independentlyParsed).toBe(true);
          expect(candidate.validation.errors).toBe(0);

          const parsed = parseMnc(candidate.generatedMnc);
          expect(parsed.ast).not.toBeNull();
          expect(parsed.diagnostics.filter((entry) => entry.severity === "error")).toEqual([]);

          const reintegrated = linkWorkspace([
            ...example.files.map((file) => ({ ...file })),
            {
              path: `Generated-${candidate.id}.mncspec`,
              kind: "mncspec",
              source: candidate.generatedMnc,
            },
          ]);
          expect(reintegrated.errorCount).toBe(0);

          for (const node of candidate.controlNodes) {
            expect(declaredInterfaces.has(node.componentInterface)).toBe(true);
            expect(candidate.generatedMnc).toContain(
              `implements interface ${node.componentInterface}`,
            );
          }

          for (const binding of candidate.bindings) {
            for (const command of binding.commands) {
              expect(candidate.generatedMnc.includes(`Command ${command}`)).toBe(true);
            }
          }
        }
      });

      it("qualifies, assures and builds an internally checksummed release bundle", () => {
        const workspace = linked(example);
        const report = synthesize(workspace);
        const candidate = report.candidates[0]!;
        const qualification = qualify(workspace, report);
        const assurance = buildAssurance(workspace, report, candidate.id);
        const approvalHash = approvalFingerprint(candidate.generatedMnc);
        const bundle = buildRelease(workspace, report, assurance, "1.0.0", {
          approvalFingerprint: approvalHash,
          approvalCurrent: true,
        });

        expect(qualification.qualified).toBe(true);
        expect(qualification.rulesFailed).toBe(0);
        expect(qualification.propertiesFailed).toBe(0);
        expect(assurance.blockers).toBe(0);
        expect(assurance.tracedPercent).toBe(100);
        expect(assurance.gates.every((gate) => gate.status === "pass")).toBe(true);
        expect(bundle.releasable).toBe(true);
        expect(bundle.blockedBy).toEqual([]);
        expect(bundle.candidateFingerprint).toBe(sha256(candidate.generatedMnc));
        expect(bundle.manifestHash).toBe(sha256(bundle.manifest));
        expect(bundle.manifestHash).toHaveLength(64);

        const generated = bundle.artifacts.filter((artifact) => artifact.kind === "generated");
        expect(generated).toHaveLength(1);
        expect(generated[0]!.path.endsWith(".mncspec")).toBe(true);
        expect(
          parseMnc(generated[0]!.content).diagnostics.filter((d) => d.severity === "error"),
        ).toEqual([]);

        for (const artifact of bundle.artifacts) {
          expect(artifact.sha256).toBe(sha256(artifact.content));
          expect(artifact.bytes).toBe(new TextEncoder().encode(artifact.content).length);
        }

        const paths = new Set(bundle.artifacts.map((artifact) => artifact.path));
        for (const required of [
          "evidence/ledger.json",
          "evidence/validation.json",
          "evidence/qualification.json",
          "evidence/desktop-conformance.json",
          "reports/traceability.json",
          "reports/gates.json",
          "reports/findings.json",
        ]) {
          expect(paths.has(required)).toBe(true);
        }
      });
    });
  }
});

describe("release-hardening mutation and fail-closed matrix", () => {
  const baseline = EXAMPLE_WORKSPACES[0]!;

  function mutate(predicate: (file: WorkspaceFile) => boolean, patch: (source: string) => string) {
    return baseline.files.map((file) =>
      predicate(file) ? { ...file, source: patch(file.source) } : { ...file },
    );
  }

  it.each([
    {
      name: "malformed activity syntax",
      files: () =>
        mutate(
          (file) => file.kind === "activity",
          (source) => `${source}\n???`,
        ),
    },
    {
      name: "unknown required capability",
      files: () =>
        mutate(
          (file) => file.kind === "activity",
          (source) =>
            source.replace(/requireCapability : Navigate/, "requireCapability : MissingCapability"),
        ),
    },
    {
      name: "unknown component interface",
      files: () =>
        mutate(
          (file) => file.kind === "cap",
          (source) =>
            source.replace(/component interface Vehicle/, "component interface MissingInterface"),
        ),
    },
    {
      name: "capability exposes undeclared command",
      files: () =>
        mutate(
          (file) => file.kind === "cap",
          (source) =>
            source.replace(
              /fireable commands : MoveTo, Stop/,
              "fireable commands : GhostCommand, Stop",
            ),
        ),
    },
  ])("blocks synthesis and release for $name", ({ files }) => {
    const workspace = linkWorkspace(files());
    const report = synthesize(workspace);
    const assurance = buildAssurance(workspace, report, null);
    const bundle = buildRelease(workspace, report, assurance, "1.0.0", {
      approvalCurrent: false,
    });

    expect(workspace.errorCount).toBeGreaterThan(0);
    expect(report.ready).toBe(false);
    expect(report.candidates).toEqual([]);
    expect(assurance.releasable).toBe(false);
    expect(bundle.releasable).toBe(false);
    expect(bundle.blockedBy.length).toBeGreaterThan(0);
  });

  it("invalidates an approval after generated synthesis input changes", () => {
    const originalWorkspace = linked(baseline);
    const originalReport = synthesize(originalWorkspace);
    const originalCandidate = originalReport.candidates[0]!;
    const approval: Approval = {
      candidateId: originalCandidate.id,
      candidateName: originalCandidate.name,
      fingerprint: originalCandidate.generatedMnc,
      approvedAt: "2026-10-03T00:00:00.000Z",
    };

    expect(
      approvalIsCurrentForSynthesisContext(approval, originalCandidate.generatedMnc, null),
    ).toBe(true);

    const changed = linkWorkspace(
      mutate(
        (file) => file.kind === "activity",
        (source) =>
          source.replace(
            "requireCapability : Navigate { MoveTo, WaypointReached }",
            "requireCapability : Navigate { Stop, WaypointReached }",
          ),
      ),
    );
    const changedReport = synthesize(changed);
    expect(changedReport.ready).toBe(true);
    const changedCandidate = changedReport.candidates.find(
      (candidate) => candidate.id === originalCandidate.id,
    )!;

    expect(changedCandidate.generatedMnc).not.toBe(originalCandidate.generatedMnc);
    expect(
      approvalIsCurrentForSynthesisContext(approval, changedCandidate.generatedMnc, null),
    ).toBe(false);
  });

  it("produces byte-stable release identity from equivalent cloned inputs", () => {
    const aWorkspace = linked(baseline);
    const aReport = synthesize(aWorkspace);
    const aAssurance = buildAssurance(aWorkspace, aReport, aReport.candidates[0]!.id);
    const a = buildRelease(aWorkspace, aReport, aAssurance, "1.0.0");

    const bWorkspace = linked({
      ...baseline,
      files: baseline.files.map((file) => ({ ...file })),
    });
    const bReport = synthesize(bWorkspace);
    const bAssurance = buildAssurance(bWorkspace, bReport, bReport.candidates[0]!.id);
    const b = buildRelease(bWorkspace, bReport, bAssurance, "1.0.0");

    expect(b.manifest).toBe(a.manifest);
    expect(b.manifestHash).toBe(a.manifestHash);
    expect(b.artifacts.map((artifact) => artifact.sha256)).toEqual(
      a.artifacts.map((artifact) => artifact.sha256),
    );
  });
});

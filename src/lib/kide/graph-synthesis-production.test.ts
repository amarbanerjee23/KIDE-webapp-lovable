import { describe, expect, it } from "vitest";
import { linkWorkspace, SAMPLE_WORKSPACE } from "@/lib/dsl";
import type { GraphSynthesisInputEvidence } from "./graph-synthesis-promotion";
import {
  approvalFingerprint,
  approvalIsCurrentForSynthesisContext,
  type Approval,
} from "./approval-store";
import { buildAssurance } from "./assurance";
import { buildRelease } from "./release";
import { synthesize } from "./synthesis";

function evidence(graphFingerprint = "g".repeat(64)): GraphSynthesisInputEvidence {
  return {
    mode: "graph-assisted-inputs",
    workspaceFingerprint: "w".repeat(64),
    graphSnapshotFingerprint: graphFingerprint,
    baselineSynthesisFingerprint: "b".repeat(64),
    generatorVersion: "kide-synth 1.0.0",
    qualificationVersion: "kide-qual 1.0.0",
    sourceFingerprints: ["source-a"],
    bindings: [
      {
        requiredCapability: "Move",
        deviceSemanticId: "urn:test:device",
        deviceLabel: "Test Device",
        capabilityId: "urn:test:capability",
        sourceFingerprint: "source-a",
        confidence: 0.99,
      },
    ],
  };
}

function approval(generatedMnc: string, graphEvidence: GraphSynthesisInputEvidence): Approval {
  return {
    candidateId: "candidate-consolidated",
    candidateName: "Consolidated",
    fingerprint: approvalFingerprint(generatedMnc, graphEvidence),
    approvedAt: "2026-10-03T00:00:00.000Z",
    graphSynthesisInputs: graphEvidence,
  };
}

describe("graph synthesis production approval safety", () => {
  it("keeps an approval current only for the exact promoted graph context", () => {
    const generatedMnc = "Model Test";
    const graphEvidence = evidence();
    const current = approval(generatedMnc, graphEvidence);

    expect(approvalIsCurrentForSynthesisContext(current, generatedMnc, graphEvidence)).toBe(true);
  });

  it("invalidates approval when the graph snapshot fingerprint changes", () => {
    const generatedMnc = "Model Test";
    const approvedEvidence = evidence("a".repeat(64));
    const currentEvidence = evidence("b".repeat(64));

    expect(
      approvalIsCurrentForSynthesisContext(
        approval(generatedMnc, approvedEvidence),
        generatedMnc,
        currentEvidence,
      ),
    ).toBe(false);
  });

  it("invalidates a graph-assisted approval when runtime promotion falls back", () => {
    const generatedMnc = "Model Test";
    const approvedEvidence = evidence();

    expect(
      approvalIsCurrentForSynthesisContext(
        approval(generatedMnc, approvedEvidence),
        generatedMnc,
        null,
      ),
    ).toBe(false);
  });

  it("invalidates a baseline approval if graph promotion becomes active", () => {
    const generatedMnc = "Model Test";
    const baselineApproval: Approval = {
      candidateId: "candidate-consolidated",
      candidateName: "Consolidated",
      fingerprint: generatedMnc,
      approvedAt: "2026-10-03T00:00:00.000Z",
    };

    expect(approvalIsCurrentForSynthesisContext(baselineApproval, generatedMnc, evidence())).toBe(
      false,
    );
  });

  it("marks a release bundle blocked when current approval validation fails", () => {
    const workspace = linkWorkspace(SAMPLE_WORKSPACE.map((file) => ({ ...file })));
    const report = synthesize(workspace);
    const assurance = buildAssurance(workspace, report, null);
    const bundle = buildRelease(workspace, report, assurance, "1.0.0", {
      graphSynthesisInputs: evidence(),
      approvalFingerprint: "approval",
      approvalCurrent: false,
    });

    expect(bundle.releasable).toBe(false);
    expect(bundle.blockedBy).toContain("Current reviewer approval");
    expect(bundle.manifest).toContain("Current reviewer approval");
  });
});

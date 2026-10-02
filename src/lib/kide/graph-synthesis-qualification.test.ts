import { describe, expect, it } from "vitest";
import { linkWorkspace, SAMPLE_WORKSPACE, type ActivityFileNode } from "@/lib/dsl";
import type { GlobalDeviceCandidate, GlobalKnowledgeSnapshot } from "@/lib/knowledge/contracts";
import { qualifyGraphShadowCase } from "./graph-synthesis-qualification";

function workspace() {
  return linkWorkspace(SAMPLE_WORKSPACE.map((file) => ({ ...file })));
}

function requiredCapabilities() {
  const ws = workspace();
  const names = new Set<string>();
  for (const file of ws.files) {
    if (file.result.ast?.node !== "ActivityFile") continue;
    for (const diagram of (file.result.ast as ActivityFileNode).diagrams) {
      for (const activity of diagram.activities) {
        const name = activity.requiredCapability ?? activity.bindCapability ?? null;
        if (name) names.add(name);
      }
    }
  }
  return [...names].sort();
}

function deviceFor(name: string, index: number): GlobalDeviceCandidate {
  return {
    semanticId: `urn:corpus:device:${index}`,
    label: `Corpus Device ${index}`,
    manufacturer: "KIDE Corpus",
    model: `C${index}`,
    sourceUri: `https://example.test/corpus/${index}`,
    sourceLicense: "CC-BY-4.0",
    sourceVersion: "1",
    retrievedAt: "2026-10-02T00:00:00.000Z",
    confidence: 0.95,
    sourceFingerprint: `fingerprint-${index}`,
    capabilities: [
      {
        semanticId: `urn:corpus:capability:${index}`,
        label: name,
        interfaceIds: [`urn:corpus:interface:${index}`],
        behaviorIds: [`urn:corpus:behavior:${index}`],
        contextIds: [`urn:corpus:context:${index}`],
        preconditionIds: [`urn:corpus:precondition:${index}`],
        postconditionIds: [`urn:corpus:postcondition:${index}`],
      },
    ],
  };
}

function completeSnapshot(): GlobalKnowledgeSnapshot {
  return {
    backend: "janusgraph",
    generatedAt: "2026-10-02T00:00:00.000Z",
    devices: requiredCapabilities().map(deviceFor),
  };
}

describe("graph synthesis qualification corpus", () => {
  it("preserves qualification, assurance and release evidence for complete trusted knowledge", () => {
    const result = qualifyGraphShadowCase("complete", workspace(), completeSnapshot());
    expect(result.passed).toBe(true);
    expect(result.shadow.promotionEligible).toBe(true);
    expect(result.baselineManifestHash).toBe(result.repeatedManifestHash);
  });

  it("is invariant to graph device ordering", () => {
    const ws = workspace();
    const a = qualifyGraphShadowCase("ordered", ws, completeSnapshot());
    const reversed = completeSnapshot();
    reversed.devices.reverse();
    const b = qualifyGraphShadowCase("reversed", ws, reversed);

    expect(a.passed).toBe(true);
    expect(b.passed).toBe(true);
    expect(a.shadow.graphSnapshotFingerprint).toBe(b.shadow.graphSnapshotFingerprint);
    expect(a.shadow.matches).toEqual(b.shadow.matches);
    expect(a.baselineManifestHash).toBe(b.baselineManifestHash);
  });

  it("ignores irrelevant trusted graph knowledge without perturbing release evidence", () => {
    const baseline = completeSnapshot();
    const extra = deviceFor("IrrelevantCapability", 999);
    baseline.devices.push(extra);

    const result = qualifyGraphShadowCase("irrelevant", workspace(), baseline);
    expect(result.passed).toBe(true);
    expect(result.shadow.promotionEligible).toBe(true);
    expect(
      result.shadow.matches
        .flatMap((m) => m.matchedDevices)
        .some((d) => d.semanticId === extra.semanticId),
    ).toBe(false);
  });

  it("fails promotion eligibility for a missing required capability but preserves baseline release", () => {
    const value = completeSnapshot();
    value.devices = value.devices.slice(1);

    const result = qualifyGraphShadowCase("missing", workspace(), value);
    expect(result.passed).toBe(true);
    expect(result.shadow.promotionEligible).toBe(false);
    expect(result.shadow.missingCapabilities.length).toBe(1);
    expect(result.releaseStable).toBe(true);
  });

  it("fails promotion eligibility for an incomplete 5-tuple but preserves baseline release", () => {
    const value = completeSnapshot();
    value.devices[0]!.capabilities[0]!.postconditionIds = [];

    const result = qualifyGraphShadowCase("incomplete", workspace(), value);
    expect(result.passed).toBe(true);
    expect(result.shadow.promotionEligible).toBe(false);
    expect(result.shadow.incompleteContracts.length).toBeGreaterThan(0);
    expect(result.releaseStable).toBe(true);
  });

  it("preserves a blocked baseline when source models are invalid", () => {
    const broken = SAMPLE_WORKSPACE.map((file) =>
      file.path.endsWith(".cap") ? { ...file, source: `${file.source}\n???` } : { ...file },
    );
    const ws = linkWorkspace(broken);

    const result = qualifyGraphShadowCase("broken-workspace", ws, completeSnapshot());
    expect(result.passed).toBe(true);
    expect(result.shadow.promotionEligible).toBe(false);
    expect(result.releaseStable).toBe(true);
  });
});

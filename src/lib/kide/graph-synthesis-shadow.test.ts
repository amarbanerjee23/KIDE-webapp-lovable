import { describe, expect, it } from "vitest";
import { linkWorkspace, SAMPLE_WORKSPACE, type ActivityFileNode } from "@/lib/dsl";
import type { GlobalKnowledgeSnapshot } from "@/lib/knowledge/contracts";
import { synthesize } from "./synthesis";
import { assessGraphSynthesisShadow } from "./graph-synthesis-shadow";

function workspace() {
  return linkWorkspace(
    SAMPLE_WORKSPACE.map((file) => ({
      path: file.path,
      kind: file.kind,
      source: file.source,
    })),
  );
}

function requiredCapabilities() {
  const ws = workspace();
  const result = new Set<string>();
  for (const file of ws.files) {
    if (file.result.ast?.node !== "ActivityFile") continue;
    for (const diagram of (file.result.ast as ActivityFileNode).diagrams) {
      for (const activity of diagram.activities) {
        const name = activity.requiredCapability ?? activity.bindCapability ?? null;
        if (name) result.add(name);
      }
    }
  }
  return [...result].sort();
}

function snapshot(complete = true): GlobalKnowledgeSnapshot {
  return {
    backend: "janusgraph",
    generatedAt: "2026-10-02T00:00:00.000Z",
    devices: requiredCapabilities().map((name, index) => ({
      semanticId: `urn:test:device:${index}`,
      label: `Device ${index}`,
      manufacturer: "KIDE Test",
      model: `M${index}`,
      sourceUri: `https://example.test/device/${index}`,
      sourceLicense: "CC-BY-4.0",
      sourceVersion: "1",
      retrievedAt: "2026-10-02T00:00:00.000Z",
      confidence: 0.99,
      sourceFingerprint: `source-${index}`,
      capabilities: [
        {
          semanticId: `urn:test:capability:${index}`,
          label: name,
          interfaceIds: [`urn:test:interface:${index}`],
          behaviorIds: [`urn:test:behavior:${index}`],
          contextIds: [`urn:test:context:${index}`],
          preconditionIds: [`urn:test:pre:${index}`],
          postconditionIds: complete ? [`urn:test:post:${index}`] : [],
        },
      ],
    })),
  };
}

describe("graph-assisted synthesis shadow mode", () => {
  it("never mutates or replaces the deterministic baseline synthesis result", () => {
    const ws = workspace();
    const before = synthesize(ws);
    const shadow = assessGraphSynthesisShadow(ws, before, snapshot());
    const after = synthesize(ws);

    expect(shadow.mode).toBe("shadow");
    expect(shadow.applied).toBe(false);
    expect(after).toEqual(before);
    expect(shadow.promotionEligible).toBe(true);
  });

  it("is deterministic for equivalent graph snapshots regardless of device order", () => {
    const ws = workspace();
    const baseline = synthesize(ws);
    const first = snapshot();
    const second = { ...first, devices: [...first.devices].reverse() };

    const a = assessGraphSynthesisShadow(ws, baseline, first);
    const b = assessGraphSynthesisShadow(ws, baseline, second);

    expect(a.graphSnapshotFingerprint).toBe(b.graphSnapshotFingerprint);
    expect(a.baselineSynthesisFingerprint).toBe(b.baselineSynthesisFingerprint);
    expect(a.matches).toEqual(b.matches);
  });

  it("fails promotion eligibility when graph knowledge is incomplete", () => {
    const ws = workspace();
    const result = assessGraphSynthesisShadow(ws, synthesize(ws), snapshot(false));

    expect(result.promotionEligible).toBe(false);
    expect(result.incompleteContracts.length).toBeGreaterThan(0);
    expect(result.missingCapabilities.length).toBeGreaterThan(0);
  });

  it("fails promotion eligibility when a required capability is absent", () => {
    const ws = workspace();
    const value = snapshot();
    value.devices = value.devices.slice(1);

    const result = assessGraphSynthesisShadow(ws, synthesize(ws), value);
    expect(result.promotionEligible).toBe(false);
    expect(result.missingCapabilities.length).toBe(1);
  });
});

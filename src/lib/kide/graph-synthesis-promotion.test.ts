import { describe, expect, it } from "vitest";
import { linkWorkspace, SAMPLE_WORKSPACE, type ActivityFileNode } from "@/lib/dsl";
import type { GlobalKnowledgeSnapshot } from "@/lib/knowledge/contracts";
import {
  promoteGraphSynthesisInputs,
  graphSynthesisInputsEnabled,
} from "./graph-synthesis-promotion";
import { synthesize } from "./synthesis";

function workspace() {
  return linkWorkspace(SAMPLE_WORKSPACE.map((file) => ({ ...file })));
}

function snapshot(extraCandidate = false): GlobalKnowledgeSnapshot {
  const ws = workspace();
  const required = new Set<string>();
  for (const file of ws.files) {
    if (file.result.ast?.node !== "ActivityFile") continue;
    for (const diagram of (file.result.ast as ActivityFileNode).diagrams) {
      for (const activity of diagram.activities) {
        const name = activity.requiredCapability ?? activity.bindCapability ?? null;
        if (name) required.add(name);
      }
    }
  }

  const devices = [...required].sort().flatMap((name, index) => {
    const makeDevice = (suffix: string, confidence: number) => ({
      semanticId: `urn:promotion:device:${index}:${suffix}`,
      label: `Promotion Device ${index} ${suffix}`,
      manufacturer: "KIDE",
      model: `P${index}${suffix}`,
      sourceUri: `https://example.test/promotion/${index}/${suffix}`,
      sourceLicense: "CC-BY-4.0",
      sourceVersion: "1",
      retrievedAt: "2026-10-03T00:00:00.000Z",
      confidence,
      sourceFingerprint: `promotion-source-${index}-${suffix}`,
      capabilities: [
        {
          semanticId: `urn:promotion:capability:${index}:${suffix}`,
          label: name,
          interfaceIds: [`urn:promotion:interface:${index}:${suffix}`],
          behaviorIds: [`urn:promotion:behavior:${index}:${suffix}`],
          contextIds: [`urn:promotion:context:${index}:${suffix}`],
          preconditionIds: [`urn:promotion:pre:${index}:${suffix}`],
          postconditionIds: [`urn:promotion:post:${index}:${suffix}`],
        },
      ],
    });
    return extraCandidate ? [makeDevice("b", 0.9), makeDevice("a", 0.97)] : [makeDevice("a", 0.97)];
  });

  return {
    backend: "janusgraph",
    generatedAt: "2026-10-03T00:00:00.000Z",
    devices,
  };
}

describe("graph synthesis input promotion", () => {
  it("is default-off and requires an explicit true value", () => {
    expect(graphSynthesisInputsEnabled(undefined)).toBe(false);
    expect(graphSynthesisInputsEnabled("0")).toBe(false);
    expect(graphSynthesisInputsEnabled("1")).toBe(true);
    expect(graphSynthesisInputsEnabled("true")).toBe(true);
  });

  it("returns the byte-identical baseline when disabled", () => {
    const ws = workspace();
    const baseline = synthesize(ws);
    const result = promoteGraphSynthesisInputs(ws, baseline, snapshot(), false);
    expect(result.applied).toBe(false);
    expect(result.report).toBe(baseline);
    expect(result.evidence).toBeNull();
  });

  it("selects graph bindings deterministically by confidence then semantic id", () => {
    const ws = workspace();
    const baseline = synthesize(ws);
    const result = promoteGraphSynthesisInputs(ws, baseline, snapshot(true), true);
    expect(result.applied).toBe(true);
    expect(result.report).toBe(baseline);
    expect(result.evidence?.bindings.length).toBeGreaterThan(0);
    expect(result.evidence?.bindings.every((binding) => binding.confidence === 0.97)).toBe(true);
  });

  it("is invariant to graph device ordering", () => {
    const ws = workspace();
    const baseline = synthesize(ws);
    const a = snapshot(true);
    const b = snapshot(true);
    b.devices.reverse();
    const first = promoteGraphSynthesisInputs(ws, baseline, a, true);
    const second = promoteGraphSynthesisInputs(ws, baseline, b, true);
    expect(first.evidence).toEqual(second.evidence);
  });

  it("falls back to baseline if qualified graph coverage is incomplete", () => {
    const ws = workspace();
    const baseline = synthesize(ws);
    const value = snapshot();
    value.devices = value.devices.slice(1);
    const result = promoteGraphSynthesisInputs(ws, baseline, value, true);
    expect(result.applied).toBe(false);
    expect(result.report).toBe(baseline);
    expect(result.evidence).toBeNull();
  });

  it("changes the workspace fingerprint when source inputs change", () => {
    const ws = workspace();
    const baseline = synthesize(ws);
    const first = promoteGraphSynthesisInputs(ws, baseline, snapshot(), true);
    const changed = linkWorkspace(
      SAMPLE_WORKSPACE.map((file, index) =>
        index === 0 ? { ...file, source: `${file.source}\n// fingerprint change` } : { ...file },
      ),
    );
    const second = promoteGraphSynthesisInputs(changed, synthesize(changed), snapshot(), true);
    expect(first.evidence?.workspaceFingerprint).not.toBe(second.evidence?.workspaceFingerprint);
  });
});

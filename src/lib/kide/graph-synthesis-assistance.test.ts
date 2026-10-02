import { describe, expect, it } from "vitest";
import { linkWorkspace, SAMPLE_WORKSPACE, type ActivityFileNode } from "@/lib/dsl";
import type { GlobalKnowledgeSnapshot } from "@/lib/knowledge/contracts";
import { synthesize } from "./synthesis";
import { evaluateGraphAssistance, graphAssistanceEnabled } from "./graph-synthesis-assistance";

function workspace() {
  return linkWorkspace(SAMPLE_WORKSPACE.map((file) => ({ ...file })));
}

function snapshot(): GlobalKnowledgeSnapshot {
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

  return {
    backend: "janusgraph",
    generatedAt: "2026-10-02T00:00:00.000Z",
    devices: [...required].sort().map((name, index) => ({
      semanticId: `urn:assist:device:${index}`,
      label: `Assist Device ${index}`,
      manufacturer: "KIDE",
      model: `A${index}`,
      sourceUri: `https://example.test/assist/${index}`,
      sourceLicense: "CC-BY-4.0",
      sourceVersion: "1",
      retrievedAt: "2026-10-02T00:00:00.000Z",
      confidence: 0.97,
      sourceFingerprint: `assist-source-${index}`,
      capabilities: [{
        semanticId: `urn:assist:capability:${index}`,
        label: name,
        interfaceIds: [`urn:assist:interface:${index}`],
        behaviorIds: [`urn:assist:behavior:${index}`],
        contextIds: [`urn:assist:context:${index}`],
        preconditionIds: [`urn:assist:pre:${index}`],
        postconditionIds: [`urn:assist:post:${index}`],
      }],
    })),
  };
}

describe("graph-assisted synthesis feature flag", () => {
  it("is default-off and only accepts explicit true values", () => {
    expect(graphAssistanceEnabled(undefined)).toBe(false);
    expect(graphAssistanceEnabled("0")).toBe(false);
    expect(graphAssistanceEnabled("TRUE")).toBe(false);
    expect(graphAssistanceEnabled("1")).toBe(true);
    expect(graphAssistanceEnabled("true")).toBe(true);
  });

  it("does not evaluate graph knowledge when disabled", () => {
    const ws = workspace();
    const baseline = synthesize(ws);
    const result = evaluateGraphAssistance(ws, baseline, snapshot(), false);

    expect(result.status).toBe("disabled");
    expect(result.applied).toBe(false);
    expect(result.shadow).toBeNull();
    expect(result.recommendations).toEqual([]);
    expect(synthesize(ws)).toEqual(baseline);
  });

  it("activates recommendations only for promotion-eligible graph knowledge", () => {
    const ws = workspace();
    const baseline = synthesize(ws);
    const result = evaluateGraphAssistance(ws, baseline, snapshot(), true);

    expect(result.status).toBe("active");
    expect(result.applied).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.shadow?.promotionEligible).toBe(true);
    expect(synthesize(ws)).toEqual(baseline);
  });

  it("fails closed when required graph knowledge is missing", () => {
    const ws = workspace();
    const baseline = synthesize(ws);
    const value = snapshot();
    value.devices = value.devices.slice(1);

    const result = evaluateGraphAssistance(ws, baseline, value, true);
    expect(result.status).toBe("blocked");
    expect(result.applied).toBe(false);
    expect(result.recommendations).toEqual([]);
  });

  it("fails closed when graph retrieval is unavailable", () => {
    const ws = workspace();
    const result = evaluateGraphAssistance(
      ws,
      synthesize(ws),
      null,
      true,
      "Knowledge graph unavailable.",
    );
    expect(result.status).toBe("unavailable");
    expect(result.applied).toBe(false);
  });
});

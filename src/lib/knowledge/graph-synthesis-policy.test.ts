import { describe, expect, it } from "vitest";
import { resolveGraphSynthesisProductionPolicy } from "./graph-synthesis-policy";

describe("graph synthesis production policy", () => {
  it("is disabled by default", () => {
    expect(resolveGraphSynthesisProductionPolicy({})).toMatchObject({
      productionEnabled: false,
      killSwitch: false,
      enabled: false,
    });
  });

  it("requires an explicit production enable value", () => {
    expect(
      resolveGraphSynthesisProductionPolicy({
        KIDE_GRAPH_SYNTHESIS_PRODUCTION_ENABLED: "true",
      }).enabled,
    ).toBe(true);
  });

  it("gives the kill switch precedence over production enablement", () => {
    const policy = resolveGraphSynthesisProductionPolicy({
      KIDE_GRAPH_SYNTHESIS_PRODUCTION_ENABLED: "1",
      KIDE_GRAPH_SYNTHESIS_KILL_SWITCH: "1",
    });
    expect(policy.productionEnabled).toBe(true);
    expect(policy.killSwitch).toBe(true);
    expect(policy.enabled).toBe(false);
  });

  it("does not accept ambiguous truthy values", () => {
    expect(
      resolveGraphSynthesisProductionPolicy({
        KIDE_GRAPH_SYNTHESIS_PRODUCTION_ENABLED: "yes",
      }).enabled,
    ).toBe(false);
  });
});

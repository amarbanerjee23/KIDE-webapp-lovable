import { describe, expect, it } from "vitest";
import { linkWorkspace, SAMPLE_WORKSPACE } from "@/lib/dsl";
import { parseActivity } from "@/lib/dsl";
import { printActivityFile } from "@/lib/dsl/activity-printer";
import { synthesize } from "./synthesis";
import { qualify } from "./qualification";
import { addActivity, autoLayout, buildGraph, connect, removeActivity } from "./activity-graph";

function workspace(overrides: Record<string, string> = {}) {
  return linkWorkspace(
    SAMPLE_WORKSPACE.map((file) => ({
      path: file.path,
      kind: file.kind,
      source: overrides[file.path] ?? file.source,
    })),
  );
}

describe("synthesis qualification", () => {
  const ws = workspace();
  const report = synthesize(ws);
  const result = qualify(ws, report);

  it("qualifies the reference workspace", () => {
    expect(result.blockedReasons).toEqual([]);
    expect(result.qualified).toBe(true);
  });

  it("checks every rule and records its thesis source", () => {
    expect(result.rules.length).toBeGreaterThanOrEqual(10);
    for (const rule of result.rules) {
      expect(rule.source).not.toEqual("");
      expect(rule.rationale).not.toEqual("");
    }
  });

  it("passes determinism, irrelevance and order-independence properties", () => {
    expect(result.properties.map((property) => property.status)).not.toContain("fail");
    expect(result.properties.map((property) => property.id)).toEqual(
      expect.arrayContaining(["P-01", "P-02", "P-03"]),
    );
  });

  it("blocks when a capability names a device that does not exist", () => {
    const broken = workspace({
      "Ecre.cap": SAMPLE_WORKSPACE.find((file) => file.path === "Ecre.cap")!.source.replace(
        "interface Vehicle {",
        "interface Ghost {",
      ),
    });
    const bad = qualify(broken, synthesize(broken));
    expect(bad.qualified).toBe(false);
    expect(bad.rules.find((rule) => rule.id === "QR-01")?.status).toBe("fail");
  });

  it("is itself deterministic", () => {
    expect(JSON.stringify(qualify(ws, synthesize(ws)))).toEqual(JSON.stringify(result));
  });
});

describe("activity designer edits", () => {
  const source = SAMPLE_WORKSPACE.find((file) => file.path === "MissionPlanning.activity")!.source;
  const file = parseActivity(source).ast!;
  const diagram = file.diagrams[0]!;

  it("round-trips the reference workflow without new errors", () => {
    const printed = printActivityFile(file);
    const reparsed = parseActivity(printed);
    expect(reparsed.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(reparsed.ast?.diagrams[0]?.activities.map((a) => a.name)).toEqual(
      diagram.activities.map((a) => a.name),
    );
  });

  it("prints byte-identically on repeat", () => {
    expect(printActivityFile(file)).toEqual(printActivityFile(file));
  });

  it("adds, connects and removes steps", () => {
    let next = addActivity(diagram, "Inspect", { kind: "capability", ref: "Recharge", controls: ["Stop"] });
    next = connect(next, "RechargeStep", "Inspect", "Completed");
    expect(next.activities.map((a) => a.name)).toContain("Inspect");
    const graph = buildGraph(next);
    expect(graph.edges.some((edge) => edge.to === "Inspect")).toBe(true);
    const removed = removeActivity(next, "Inspect");
    expect(removed.activities.some((a) => a.name === "Inspect")).toBe(false);
    expect(
      removed.activities.flatMap((a) => a.conditionalActivity).some((c) => c.onTrueNextActivity === "Inspect"),
    ).toBe(false);
  });

  it("marks alarm branches as failure paths", () => {
    const graph = buildGraph(diagram);
    expect(graph.edges.some((edge) => edge.kind === "failure")).toBe(true);
  });

  it("lays out deterministically", () => {
    expect(autoLayout(diagram)).toEqual(autoLayout(diagram));
  });
});

import { describe, expect, it } from "vitest";
import { linkWorkspace, SAMPLE_WORKSPACE } from "@/lib/dsl";
import { synthesize } from "./synthesis";
import { buildScenario, resolveTransition } from "./scenario";

const workspace = () => linkWorkspace(SAMPLE_WORKSPACE);

describe("synthesis", () => {
  it("passes preflight on the reference workspace", () => {
    const report = synthesize(workspace());
    expect(report.preflight.filter((check) => check.status === "fail")).toEqual([]);
    expect(report.ready).toBe(true);
  });

  it("produces candidates whose generated control model revalidates cleanly", () => {
    const report = synthesize(workspace());
    expect(report.candidates.length).toBeGreaterThan(0);
    for (const candidate of report.candidates) {
      expect(candidate.validation.independentlyParsed).toBe(true);
      expect(candidate.validation.errors).toBe(0);
    }
  });

  it("only issues commands the bound capability declares", () => {
    const report = synthesize(workspace());
    const capabilityCommands = new Set(["MoveTo", "Stop", "Dock"]);
    for (const candidate of report.candidates) {
      for (const binding of candidate.bindings) {
        for (const command of binding.commands) {
          expect(capabilityCommands.has(command)).toBe(true);
        }
      }
    }
  });

  it("is deterministic", () => {
    const a = JSON.stringify(synthesize(workspace()));
    const b = JSON.stringify(synthesize(workspace()));
    expect(a).toBe(b);
  });

  it("blocks synthesis when a step names an unknown capability", () => {
    const broken = SAMPLE_WORKSPACE.map((file) =>
      file.kind === "activity"
        ? { ...file, source: file.source.replace(/requireCapability : \w+/, "requireCapability : Missing") }
        : file,
    );
    const report = synthesize(linkWorkspace(broken));
    expect(report.ready).toBe(false);
    expect(report.candidates).toEqual([]);
  });
});

describe("scenario runner", () => {
  it("builds runnable steps from the workflow", () => {
    const scenario = buildScenario(workspace());
    expect(scenario.problems).toEqual([]);
    expect(scenario.steps.length).toBeGreaterThan(0);
    expect(scenario.startActivity).toBe(scenario.steps[0]?.activity);
  });

  it("follows the declared branch for an outcome", () => {
    const scenario = buildScenario(workspace());
    const branching = scenario.steps.find((step) => step.branches.length > 0);
    expect(branching).toBeDefined();
    const branch = branching!.branches[0]!;
    const transition = resolveTransition(branching!, branch.outcome);
    expect(transition.nextActivity ?? transition.finalResult).toBe(
      branch.nextActivity ?? branch.finalResult,
    );
  });

  it("falls back to the declared next step for an unmatched outcome", () => {
    const scenario = buildScenario(workspace());
    const step = scenario.steps.find((entry) => entry.nextActivity);
    expect(step).toBeDefined();
    expect(resolveTransition(step!, "NotADeclaredOutcome").nextActivity).toBe(step!.nextActivity);
  });
});

/**
 * Trust Centre engine.
 *
 * Collects every machine-checkable statement about the current workspace —
 * grammar and cross-model diagnostics, synthesis preflight, independent
 * re-validation of the generated control model, and workflow reachability —
 * turns each into a finding with an impact and a repair, and derives the
 * release gates from them. Nothing here is heuristic: every finding is
 * produced by a named rule over the parsed models.
 */
import type { Workspace } from "@/lib/dsl";
import type { SynthesisReport, Candidate } from "./synthesis";
import { qualify, type QualificationReport } from "./qualification";
import { buildScenario, type Scenario } from "./scenario";

export type FindingSeverity = "blocker" | "warning" | "info";

export interface Finding {
  id: string;
  rule: string;
  severity: FindingSeverity;
  area: "models" | "synthesis" | "workflow" | "coverage";
  title: string;
  impact: string;
  repair: string;
  location?: string;
}

export interface TraceRow {
  step: string;
  capability: string | null;
  componentInterface: string | null;
  commands: string[];
  observations: string[];
  controlNode: string | null;
  operation: string | null;
  status: "traced" | "partial" | "untraced";
}

export interface Gate {
  id: string;
  label: string;
  detail: string;
  status: "pass" | "fail";
}

export interface AssuranceReport {
  findings: Finding[];
  blockers: number;
  warnings: number;
  traceability: TraceRow[];
  tracedPercent: number;
  gates: Gate[];
  releasable: boolean;
  candidate: Candidate | null;
  scenario: Scenario;
  qualification: QualificationReport;
}

function push(findings: Finding[], finding: Omit<Finding, "id">) {
  findings.push({ ...finding, id: `${finding.rule}:${findings.length + 1}` });
}

export function buildAssurance(
  workspace: Workspace,
  report: SynthesisReport,
  candidateId: string | null,
): AssuranceReport {
  const findings: Finding[] = [];
  const scenario = buildScenario(workspace);
  const qualification = qualify(workspace, report);

  // 1. Model-level diagnostics.
  for (const file of workspace.files) {
    for (const diagnostic of file.diagnostics) {
      if (diagnostic.severity === "info") continue;
      push(findings, {
        rule: diagnostic.code,
        severity: diagnostic.severity === "error" ? "blocker" : "warning",
        area: "models",
        title: diagnostic.message,
        impact:
          diagnostic.severity === "error"
            ? "The model cannot be interpreted, so synthesis and release are blocked."
            : "The model is understood but something in it is unused or ambiguous.",
        repair: `Open ${file.path} and correct line ${diagnostic.line}.`,
        location: `${file.path}:${diagnostic.line}:${diagnostic.column}`,
      });
    }
  }

  // 2. Synthesis preflight.
  for (const check of report.preflight) {
    if (check.status === "pass") continue;
    push(findings, {
      rule: `preflight.${check.id}`,
      severity: check.status === "fail" ? "blocker" : "warning",
      area: "synthesis",
      title: check.label,
      impact: check.detail,
      repair: "Complete the models this check names, then run synthesis again.",
    });
  }

  const candidate =
    report.candidates.find((entry) => entry.id === candidateId) ?? report.candidates[0] ?? null;

  // 3. Independent re-validation of the selected design.
  if (candidate) {
    for (const message of candidate.validation.messages) {
      push(findings, {
        rule: "synthesis.independent-validation",
        severity: "blocker",
        area: "synthesis",
        title: "The generated control model failed independent validation",
        impact: message,
        repair:
          "The generator produced a control model the language validator rejects. Fix the source models or pick another candidate.",
        location: candidate.name,
      });
    }
  }

  // 4. Workflow reachability and dead ends.
  for (const problem of scenario.problems) {
    push(findings, {
      rule: "workflow.problem",
      severity: "blocker",
      area: "workflow",
      title: problem,
      impact: "The workflow cannot be executed end to end.",
      repair: "Correct the workflow in the activity model.",
    });
  }
  for (const step of scenario.steps) {
    const terminates = step.branches.some((branch) => branch.finalResult);
    if (!step.nextActivity && !terminates && step.branches.length === 0) {
      push(findings, {
        rule: "workflow.dead-end",
        severity: "warning",
        area: "workflow",
        title: `Step '${step.activity}' has no next step and no declared result`,
        impact: "A run that reaches this step stops without a recorded outcome.",
        repair: `Give '${step.activity}' a nextActivity or a finalResult in the activity model.`,
        location: step.activity,
      });
    }
  }

  // 5. Traceability: every step down to a control node, or to a declared
  //    software operation when the step is a computation rather than a
  //    device action.
  const stepOperations = new Map<string, string[]>();
  const declaredOperations = new Set<string>();
  for (const file of workspace.files) {
    const ast = file.result.ast as
      | { node: string; diagrams?: unknown[]; operations?: { name: string }[] }
      | null;
    if (!ast) continue;
    if (ast.node === "OperationDescriptions") {
      for (const operation of ast.operations ?? []) declaredOperations.add(operation.name);
    }
    if (ast.node === "ActivityFile") {
      for (const diagram of (ast.diagrams ?? []) as {
        activities: { name: string; requiresOperation: string[] }[];
      }[]) {
        for (const activity of diagram.activities) {
          if (activity.requiresOperation.length > 0) {
            stepOperations.set(activity.name, activity.requiresOperation);
          }
        }
      }
    }
  }

  const traceability: TraceRow[] = (candidate?.bindings ?? []).map((binding) => {
    const controlNode =
      candidate?.controlNodes.find((node) => node.activities.includes(binding.activity))?.name ??
      null;
    const operations = stepOperations.get(binding.activity) ?? [];
    const operation = operations[0] ?? null;
    const operationTraced =
      operations.length > 0 && operations.every((name) => declaredOperations.has(name));
    const deviceTraced = Boolean(binding.capability && binding.componentInterface && controlNode);
    const status: TraceRow["status"] = deviceTraced
      ? binding.commands.length > 0
        ? "traced"
        : "partial"
      : operationTraced
        ? "traced"
        : "untraced";
    return {
      step: binding.activity,
      capability: binding.capability,
      componentInterface: binding.componentInterface,
      commands: binding.commands,
      observations: binding.observations,
      controlNode,
      operation,
      status,
    };
  });

  for (const row of traceability) {
    if (row.status === "traced") continue;
    push(findings, {
      rule: row.status === "untraced" ? "trace.unbound-step" : "trace.no-command",
      severity: row.status === "untraced" ? "blocker" : "warning",
      area: "coverage",
      title:
        row.status === "untraced"
          ? `Step '${row.step}' does not reach a control node or a declared operation`
          : `Step '${row.step}' issues no command`,
      impact:
        row.status === "untraced"
          ? "The generated design cannot act on this step, so the workflow is not fully realised."
          : "The step is bound but the design sends nothing to the device for it.",
      repair:
        row.status === "untraced"
          ? `Bind '${row.step}' to a capability whose component interface exists in the control model, or to an operation declared in the operation model.`
          : `Declare the commands '${row.step}' should use under useControlCapabilities.`,
      location: row.step,
    });
  }

  const tracedPercent =
    traceability.length === 0
      ? 0
      : Math.round(
          (traceability.filter((row) => row.status === "traced").length / traceability.length) * 100,
        );

  const blockers = findings.filter((finding) => finding.severity === "blocker").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;

  const gates: Gate[] = [
    {
      id: "models-clean",
      label: "Every model parses and links",
      detail: `${workspace.errorCount} errors · ${workspace.warningCount} warnings across ${workspace.files.length} models.`,
      status: workspace.errorCount === 0 ? "pass" : "fail",
    },
    {
      id: "synthesis-ready",
      label: "Synthesis preflight passed",
      detail: report.ready
        ? "All preflight checks pass, so a design was produced from complete inputs."
        : (report.blockedReason ?? "Synthesis is blocked."),
      status: report.ready ? "pass" : "fail",
    },
    {
      id: "design-validated",
      label: "Selected design revalidated independently",
      detail: candidate
        ? `${candidate.name}: ${candidate.validation.errors} errors when the generated control model is re-parsed.`
        : "No candidate design available.",
      status: candidate && candidate.validation.errors === 0 ? "pass" : "fail",
    },
    {
      id: "full-traceability",
      label: "Every workflow step traces to a control node",
      detail: `${tracedPercent}% of steps trace from workflow through capability and interface to a control node.`,
      status: tracedPercent === 100 ? "pass" : "fail",
    },
    {
      id: "no-blockers",
      label: "No open blocking findings",
      detail: `${blockers} blockers · ${warnings} warnings open in the Trust Centre.`,
      status: blockers === 0 ? "pass" : "fail",
    },
    {
      id: "workflow-runnable",
      label: "Workflow runs end to end",
      detail:
        scenario.problems.length === 0
          ? `${scenario.steps.length} steps, starting at '${scenario.startActivity ?? "—"}'.`
          : scenario.problems.join(" "),
      status: scenario.problems.length === 0 && scenario.steps.length > 0 ? "pass" : "fail",
    },
    {
      id: "synthesis-qualified",
      label: "Synthesis algorithm qualified for these models",
      detail: qualification.qualified
        ? `${qualification.rulesChecked} rules and ${qualification.properties.length} algorithm properties pass (${qualification.qualificationVersion}).`
        : qualification.blockedReasons.join(" "),
      status: qualification.qualified ? "pass" : "fail",
    },
  ];

  return {
    findings,
    blockers,
    warnings,
    traceability,
    tracedPercent,
    gates,
    releasable: gates.every((gate) => gate.status === "pass"),
    candidate,
    scenario,
    qualification,
  };
}

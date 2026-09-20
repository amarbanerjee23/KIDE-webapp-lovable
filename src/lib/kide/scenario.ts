/**
 * Discrete scenario execution over an activity workflow.
 *
 * The runner is event driven: a step issues commands, then the workflow waits
 * for one of the outcomes the capability can actually produce. Choosing an
 * outcome decides the next step, exactly as the workflow declares it.
 */
import type {
  ActivityDiagramNode,
  ActivityFileNode,
  CapabilityFileNode,
  CapabilityNode,
  Workspace,
} from "@/lib/dsl";

export interface ScenarioBranch {
  outcome: string;
  nextActivity: string | null;
  finalResult: string | null;
}

export interface ScenarioStep {
  activity: string;
  description: string;
  capability: string | null;
  operation: string | null;
  commands: string[];
  possibleOutcomes: string[];
  branches: ScenarioBranch[];
  nextActivity: string | null;
  duration: string | null;
}

export interface Scenario {
  diagram: string | null;
  steps: ScenarioStep[];
  startActivity: string | null;
  results: string[];
  problems: string[];
}

export interface TraceEntry {
  index: number;
  activity: string;
  detail: string;
  outcome: string | null;
  kind: "start" | "command" | "outcome" | "final" | "blocked";
}

function diagramOf(workspace: Workspace): ActivityDiagramNode | null {
  for (const file of workspace.files) {
    if (file.result.ast?.node === "ActivityFile") {
      const diagram = (file.result.ast as ActivityFileNode).diagrams[0];
      if (diagram) return diagram;
    }
  }
  return null;
}

function capabilitiesOf(workspace: Workspace): CapabilityNode[] {
  const list: CapabilityNode[] = [];
  for (const file of workspace.files) {
    if (file.result.ast?.node === "CapabilityFile") {
      list.push(...(file.result.ast as CapabilityFileNode).capabilities);
    }
  }
  return list;
}

/** Builds a runnable scenario from the workspace. Deterministic. */
export function buildScenario(workspace: Workspace): Scenario {
  const diagram = diagramOf(workspace);
  const capabilities = capabilitiesOf(workspace);
  const problems: string[] = [];

  if (!diagram) {
    return {
      diagram: null,
      steps: [],
      startActivity: null,
      results: [],
      problems: ["No activity workflow was found in this workspace."],
    };
  }

  const steps: ScenarioStep[] = diagram.activities.map((activity) => {
    const wanted = activity.requiredCapability ?? activity.bindCapability ?? null;
    const capability = wanted
      ? (capabilities.find((entry) => entry.name === wanted) ?? null)
      : null;
    if (wanted && !capability) {
      problems.push(`Step '${activity.name}' uses unknown capability '${wanted}'.`);
    }

    const requested = new Set(activity.useControlCapabilities);
    const declared = capability?.providesControlCapabilities;
    const outcomes = capability?.providesOutcomes;

    const commands = (declared?.commands ?? [])
      .filter((name) => requested.size === 0 || requested.has(name))
      .sort();

    const possibleOutcomes = [
      ...new Set([
        ...(outcomes?.events ?? []),
        ...(outcomes?.responses ?? []),
        ...(outcomes?.alarms ?? []),
        ...(outcomes?.dataPoints ?? []),
        ...(declared?.events ?? []),
        ...(declared?.alarms ?? []),
      ]),
    ].sort();

    const branches: ScenarioBranch[] = [];
    for (const conditional of activity.conditionalActivity) {
      for (const outcome of conditional.outcomes) {
        branches.push({
          outcome: outcome.capabilityOutcome ?? "condition",
          nextActivity: conditional.onTrueNextActivity ?? null,
          finalResult: conditional.onTrueFinalResult ?? null,
        });
      }
    }

    for (const branch of branches) {
      if (branch.outcome !== "condition" && !possibleOutcomes.includes(branch.outcome)) {
        possibleOutcomes.push(branch.outcome);
      }
    }

    return {
      activity: activity.name,
      description: activity.description ?? "",
      capability: capability?.name ?? wanted,
      operation: activity.requiresOperation[0] ?? null,
      commands,
      possibleOutcomes: possibleOutcomes.sort(),
      branches,
      nextActivity: activity.nextActivity ?? null,
      duration:
        activity.time !== undefined && activity.unit
          ? `${activity.time} ${activity.unit}`
          : null,
    };
  });

  return {
    diagram: diagram.name,
    steps,
    startActivity: steps[0]?.activity ?? null,
    results: diagram.results.map((result) => result.name),
    problems,
  };
}

export interface Transition {
  nextActivity: string | null;
  finalResult: string | null;
  explanation: string;
}

/** Resolves where the workflow goes after an outcome is observed. */
export function resolveTransition(
  step: ScenarioStep,
  outcome: string | null,
): Transition {
  if (outcome) {
    const branch = step.branches.find((entry) => entry.outcome === outcome);
    if (branch) {
      return {
        nextActivity: branch.nextActivity,
        finalResult: branch.finalResult,
        explanation: branch.finalResult
          ? `Outcome '${outcome}' ends the workflow with result '${branch.finalResult}'.`
          : `Outcome '${outcome}' continues to '${branch.nextActivity}'.`,
      };
    }
  }

  if (step.nextActivity) {
    return {
      nextActivity: step.nextActivity,
      finalResult: null,
      explanation: outcome
        ? `No branch matches outcome '${outcome}', so the declared next step '${step.nextActivity}' runs.`
        : `Step completed; the declared next step is '${step.nextActivity}'.`,
    };
  }

  return {
    nextActivity: null,
    finalResult: null,
    explanation: outcome
      ? `Outcome '${outcome}' has no declared continuation, so the workflow stops here.`
      : "This step declares no next step, so the workflow stops here.",
  };
}

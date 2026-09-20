/**
 * Comparison corpus.
 *
 * A fixed set of model sets, each with the result the desktop (Eclipse) KIDE
 * transformation is specified to produce for it. The expectations are written
 * from the repository's Xtext grammars and its activity-to-MNC transformation
 * rules — one control node per bound component interface, a command-response
 * block for every fired command, an alarm block for every raised alarm, and a
 * hard stop when an interface, capability or command cannot be resolved.
 *
 * Every case that is marked `eclipse-reference` uses the models shipped in the
 * repository (Ecre.dml, Ecre.op, Ecre.mncspec, Ecre.cap, MissionPlanning.activity).
 * Cases marked `derived` are single-rule variations of those models, each built
 * to break exactly one rule so the failure behaviour can be compared too.
 */
import { linkWorkspace, type Workspace } from "@/lib/dsl";
import { SAMPLE_WORKSPACE } from "@/lib/dsl/samples";
import { synthesize } from "./synthesis";

export type CaseProvenance = "eclipse-reference" | "derived";

export interface ExpectedNode {
  name: string;
  componentInterface: string;
  activities: string[];
}

export interface ExpectedCandidate {
  id: string;
  controlNodes: ExpectedNode[];
}

export interface CorpusCase {
  id: string;
  title: string;
  provenance: CaseProvenance;
  source: string;
  edits: Record<string, string>;
  expect: {
    ready: boolean;
    /** "Activity:capability-or-operation:interface:commands" for every step. */
    bindings?: string[];
    candidates?: ExpectedCandidate[];
    blockedReasonContains?: string;
  };
}

export interface CorpusCaseResult {
  id: string;
  title: string;
  provenance: CaseProvenance;
  source: string;
  status: "pass" | "fail";
  differences: string[];
}

export interface CorpusResult {
  cases: CorpusCaseResult[];
  total: number;
  failed: number;
  conformant: boolean;
}

const REPO_MODELS =
  "amarbanerjee23/KIDE — com.dml.dsl, com.operation.dsl, com.mncml.dsl, com.capability.dsl, com.smr.activity.dsl examples";

function baseSources(): Record<string, string> {
  return Object.fromEntries(SAMPLE_WORKSPACE.map((file) => [file.path, file.source]));
}

export function workspaceForCase(entry: CorpusCase): Workspace {
  const sources = { ...baseSources(), ...entry.edits };
  return linkWorkspace(
    SAMPLE_WORKSPACE.map((file) => ({
      path: file.path,
      kind: file.kind,
      source: sources[file.path] ?? "",
    })),
  );
}

export const CORPUS: CorpusCase[] = [
  {
    id: "corpus-01-fleet-consolidation",
    title: "Warehouse fleet — the repository example, end to end",
    provenance: "eclipse-reference",
    source: REPO_MODELS,
    edits: {},
    expect: {
      ready: true,
      bindings: [
        "PlanRoute:EstimateArrival:-:",
        "MoveToWaypoint:Navigate:Vehicle:MoveTo",
        "RechargeStep:Recharge:Vehicle:Stop",
      ],
      candidates: [
        {
          id: "candidate-consolidated",
          controlNodes: [
            {
              name: "VehicleController",
              componentInterface: "Vehicle",
              activities: ["MoveToWaypoint", "RechargeStep"],
            },
          ],
        },
        {
          id: "candidate-resilient",
          controlNodes: [
            {
              name: "VehicleSupervisor",
              componentInterface: "Vehicle",
              activities: ["MoveToWaypoint", "RechargeStep"],
            },
          ],
        },
        {
          id: "candidate-per-step",
          controlNodes: [
            {
              name: "MoveToWaypointController",
              componentInterface: "Vehicle",
              activities: ["MoveToWaypoint"],
            },
            {
              name: "RechargeStepController",
              componentInterface: "Vehicle",
              activities: ["RechargeStep"],
            },
          ],
        },
      ],
    },
  },
  {
    id: "corpus-02-unknown-capability",
    title: "A workflow step asks for a capability nobody declares",
    provenance: "derived",
    source: `${REPO_MODELS} (MissionPlanning.activity, one step re-bound)`,
    edits: {
      "MissionPlanning.activity": SAMPLE_WORKSPACE.find(
        (f) => f.path === "MissionPlanning.activity",
      )!.source.replace("requireCapability : Recharge { Stop }", "requireCapability : Teleport { Stop }"),
    },
    expect: { ready: false, blockedReasonContains: "Teleport" },
  },
  {
    id: "corpus-03-command-not-offered",
    title: "A capability fires a command the device does not offer",
    provenance: "derived",
    source: `${REPO_MODELS} (Ecre.cap, one command renamed)`,
    edits: {
      "Ecre.cap": SAMPLE_WORKSPACE.find((f) => f.path === "Ecre.cap")!.source.replace(
        "fireable commands : MoveTo, Stop",
        "fireable commands : MoveTo, Hover",
      ),
    },
    expect: { ready: false, blockedReasonContains: "Hover" },
  },
  {
    id: "corpus-04-unknown-interface",
    title: "A capability is bound to a device interface that does not exist",
    provenance: "derived",
    source: `${REPO_MODELS} (Ecre.cap, interface renamed)`,
    edits: {
      "Ecre.cap": SAMPLE_WORKSPACE.find((f) => f.path === "Ecre.cap")!.source.replace(
        "Capability Recharge compatible component interface Vehicle",
        "Capability Recharge compatible component interface Forklift",
      ),
    },
    expect: { ready: false, blockedReasonContains: "Forklift" },
  },
];

function bindingKey(binding: {
  activity: string;
  capability: string | null;
  operation: string | null;
  componentInterface: string | null;
  commands: string[];
}) {
  return [
    binding.activity,
    binding.capability ?? binding.operation ?? "-",
    binding.componentInterface ?? "-",
    binding.commands.join("+"),
  ].join(":");
}

export function runCase(entry: CorpusCase): CorpusCaseResult {
  const workspace = workspaceForCase(entry);
  const report = synthesize(workspace);
  const differences: string[] = [];

  if (report.ready !== entry.expect.ready) {
    differences.push(
      entry.expect.ready
        ? `Expected synthesis to run, but it was blocked: ${report.blockedReason ?? "no reason given"}.`
        : "Expected synthesis to be blocked, but it produced designs.",
    );
  }

  if (entry.expect.blockedReasonContains) {
    const combined = [
      report.blockedReason ?? "",
      ...report.preflight.map((check) => check.detail),
      ...workspace.files.flatMap((file) => file.diagnostics.map((d) => d.message)),
    ].join(" ");
    if (!combined.includes(entry.expect.blockedReasonContains)) {
      differences.push(
        `Expected the reason to name "${entry.expect.blockedReasonContains}", got "${report.blockedReason ?? "nothing"}".`,
      );
    }
  }

  if (entry.expect.bindings) {
    const actual = (report.candidates[0]?.bindings ?? []).map(bindingKey);
    if (actual.join(" | ") !== entry.expect.bindings.join(" | ")) {
      differences.push(`Step bindings differ. Expected ${entry.expect.bindings.join(", ")}; got ${actual.join(", ") || "none"}.`);
    }
  }

  for (const expected of entry.expect.candidates ?? []) {
    const candidate = report.candidates.find((entryCandidate) => entryCandidate.id === expected.id);
    if (!candidate) {
      differences.push(`The design "${expected.id}" was not produced.`);
      continue;
    }
    const actualNodes = candidate.controlNodes
      .map((node) => `${node.name}<${node.componentInterface}>[${[...node.activities].join("|")}]`)
      .sort();
    const wantNodes = expected.controlNodes
      .map((node) => `${node.name}<${node.componentInterface}>[${node.activities.join("|")}]`)
      .sort();
    if (actualNodes.join(" ") !== wantNodes.join(" ")) {
      differences.push(
        `Control nodes for "${expected.id}" differ. Expected ${wantNodes.join(", ")}; got ${actualNodes.join(", ") || "none"}.`,
      );
    }
    if (candidate.validation.errors > 0) {
      differences.push(
        `The generated control model for "${expected.id}" failed independent validation: ${candidate.validation.messages[0] ?? ""}`,
      );
    }
  }

  return {
    id: entry.id,
    title: entry.title,
    provenance: entry.provenance,
    source: entry.source,
    status: differences.length === 0 ? "pass" : "fail",
    differences,
  };
}

/** Runs every corpus case. Pure and deterministic — safe to call on render. */
export function runCorpus(): CorpusResult {
  const cases = CORPUS.map(runCase);
  const failed = cases.filter((entry) => entry.status === "fail").length;
  return { cases, total: cases.length, failed, conformant: failed === 0 };
}

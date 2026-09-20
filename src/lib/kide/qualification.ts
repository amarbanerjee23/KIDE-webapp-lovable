/**
 * Synthesis qualification.
 *
 * The synthesis pipeline is treated as a safety-relevant compiler: it is only
 * allowed to produce a release-grade design when every qualification rule
 * below has been checked against the actual models, and when the algorithm
 * still satisfies its stated properties on the current workspace.
 *
 * Rule sources: the thesis chapter on the K-IDE platform (automated control
 * design, §5.5.2) and on semantic code generation (§5.5.3), plus the stated
 * threats to validity (§5.6): the composition algorithm assumes deterministic
 * transition systems and valid interface specifications, and it was validated
 * at roughly 200 devices.
 */
import { linkWorkspace, type Workspace, type WorkspaceFile } from "@/lib/dsl";
import type {
  ActivityDiagramNode,
  ActivityFileNode,
  CapabilityFileNode,
  CapabilityNode,
  InterfaceDescriptionNode,
  MncModelNode,
} from "@/lib/dsl/ast";
import { GENERATOR_VERSION, synthesize, type SynthesisReport } from "./synthesis";
import { runCorpus, type CorpusResult } from "./corpus";

export const QUALIFICATION_VERSION = "kide-qual 1.0.0";
/** Device count the composition approach was validated at in the thesis. */
export const VALIDATED_DEVICE_LIMIT = 200;

export type RuleStatus = "pass" | "fail" | "not-applicable";

export interface RuleResult {
  id: string;
  title: string;
  source: string;
  rationale: string;
  status: RuleStatus;
  detail: string;
  elements: string[];
}

export interface PropertyResult {
  id: string;
  title: string;
  status: "pass" | "fail";
  detail: string;
}

export interface QualificationReport {
  qualificationVersion: string;
  generator: string;
  rules: RuleResult[];
  properties: PropertyResult[];
  rulesChecked: number;
  rulesFailed: number;
  propertiesFailed: number;
  deviceCount: number;
  withinValidatedScale: boolean;
  conformance: CorpusResult;
  qualified: boolean;
  blockedReasons: string[];
}

/* ------------------------------------------------------------------ */
/* Model access helpers                                                 */
/* ------------------------------------------------------------------ */

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

function interfacesOf(workspace: Workspace): InterfaceDescriptionNode[] {
  const list: InterfaceDescriptionNode[] = [];
  for (const file of workspace.files) {
    if (file.result.ast?.node === "Model") {
      list.push(...(file.result.ast as MncModelNode).interfaces);
    }
  }
  return list;
}

/* ------------------------------------------------------------------ */
/* Rules                                                                */
/* ------------------------------------------------------------------ */

interface RuleSpec {
  id: string;
  title: string;
  source: string;
  rationale: string;
  check: (context: {
    workspace: Workspace;
    report: SynthesisReport;
    diagram: ActivityDiagramNode | null;
  }) => { status: RuleStatus; detail: string; elements?: string[] };
}

const RULES: RuleSpec[] = [
  {
    id: "QR-01",
    title: "Every referenced component interface resolves",
    source: "Thesis §5.5.2 — composition assumes valid interface specifications",
    rationale:
      "A capability bound to an interface that no control model declares cannot be composed; the algorithm must fail loudly instead of guessing.",
    check: ({ workspace }) => {
      const declared = new Set(interfacesOf(workspace).map((item) => item.name));
      const missing = capabilitiesOf(workspace)
        .flatMap((capability) =>
          capability.componentInterface
            .filter((iface) => !declared.has(iface))
            .map((iface) => `${capability.name} → ${iface}`),
        );
      return missing.length === 0
        ? { status: "pass", detail: `${declared.size} device interfaces declared; every capability resolves.` }
        : { status: "fail", detail: "A capability names a device interface that no control model declares.", elements: missing };
    },
  },
  {
    id: "QR-02",
    title: "Every commanded operation is implemented by the bound device",
    source: "Thesis §5.5.2 — incorrect interface mappings must not yield a configuration",
    rationale: "A step may only command something the device actually offers.",
    check: ({ workspace }) => {
      const byInterface = new Map(interfacesOf(workspace).map((item) => [item.name, item]));
      const offenders: string[] = [];
      for (const capability of capabilitiesOf(workspace)) {
        for (const ifaceName of capability.componentInterface) {
          const iface = byInterface.get(ifaceName);
          if (!iface) continue;
          const offered = new Set(iface.commands.map((command) => command.name));
          for (const command of capability.providesControlCapabilities?.commands ?? []) {
            if (!offered.has(command)) offenders.push(`${capability.name}.${command}`);
          }
        }
      }
      return offenders.length === 0
        ? { status: "pass", detail: "Every fireable command exists on the bound device interface." }
        : { status: "fail", detail: "A capability fires a command the device does not offer.", elements: offenders };
    },
  },
  {
    id: "QR-03",
    title: "Control nodes expose command, data and event interfaces",
    source: "Thesis §5.5 — the control architecture is recursive and hierarchical",
    rationale:
      "Each generated node must be usable by its parent, which requires all three interfaces on the device it controls.",
    check: ({ workspace, report }) => {
      const byInterface = new Map(interfacesOf(workspace).map((item) => [item.name, item]));
      const incomplete: string[] = [];
      for (const candidate of report.candidates) {
        for (const node of candidate.controlNodes) {
          const iface = byInterface.get(node.componentInterface);
          if (!iface) continue;
          const hasCommands = iface.commands.length > 0;
          const hasEvents = iface.events.length > 0;
          const hasData = iface.dataPoints.length > 0;
          if (!hasCommands || !hasEvents || !hasData) {
            incomplete.push(
              `${node.name} (${[!hasCommands && "commands", !hasEvents && "events", !hasData && "data points"]
                .filter(Boolean)
                .join(", ")} missing)`,
            );
          }
        }
      }
      return incomplete.length === 0
        ? { status: "pass", detail: "Every generated control node controls a device with all three interfaces." }
        : { status: "fail", detail: "A generated control node lacks a required interface.", elements: [...new Set(incomplete)] };
    },
  },
  {
    id: "QR-04",
    title: "No unreachable or dead-ended workflow step",
    source: "Thesis §5.5.2 — composition assumes deterministic transition systems",
    rationale: "An unreachable step can never run, and a step with no continuation strands the workflow.",
    check: ({ diagram }) => {
      if (!diagram) return { status: "not-applicable", detail: "No workflow to check." };
      const names = diagram.activities.map((activity) => activity.name);
      const reachable = new Set<string>();
      const queue = names[0] ? [names[0]] : [];
      while (queue.length > 0) {
        const name = queue.pop()!;
        if (reachable.has(name)) continue;
        reachable.add(name);
        const activity = diagram.activities.find((item) => item.name === name);
        if (!activity) continue;
        for (const target of [
          activity.nextActivity,
          ...activity.conditionalActivity.map((condition) => condition.onTrueNextActivity),
        ]) {
          if (target) queue.push(target);
        }
      }
      const unreachable = names.filter((name) => !reachable.has(name));
      const stranded = diagram.activities
        .filter(
          (activity) =>
            !activity.nextActivity &&
            !activity.nextActivityDiagram &&
            activity.conditionalActivity.length === 0,
        )
        .map((activity) => activity.name);
      const problems = [...unreachable.map((n) => `${n} (unreachable)`), ...stranded.map((n) => `${n} (no continuation)`)];
      return problems.length === 0
        ? { status: "pass", detail: `${names.length} steps, all reachable and continued.` }
        : { status: "fail", detail: "The workflow has unreachable or stranded steps.", elements: problems };
    },
  },
  {
    id: "QR-05",
    title: "Branch outcomes are mutually distinct",
    source: "Thesis §5.5.2 — deterministic transition systems",
    rationale: "Two branches that fire on the same outcome make the next step ambiguous.",
    check: ({ diagram }) => {
      if (!diagram) return { status: "not-applicable", detail: "No workflow to check." };
      const clashes: string[] = [];
      for (const activity of diagram.activities) {
        const seen = new Set<string>();
        for (const condition of activity.conditionalActivity) {
          const key = condition.outcomes
            .map((outcome) => outcome.capabilityOutcome ?? outcome.validations.map((v) => v.parameter).join("+"))
            .join("&");
          if (seen.has(key)) clashes.push(`${activity.name}: ${key}`);
          seen.add(key);
        }
      }
      return clashes.length === 0
        ? { status: "pass", detail: "No step has two branches on the same outcome." }
        : { status: "fail", detail: "A step branches twice on the same outcome.", elements: clashes };
    },
  },
  {
    id: "QR-06",
    title: "Declared alarms have a handling path",
    source: "Thesis §5.5.2 — required failure outcomes",
    rationale: "A device alarm that no design handles leaves the system without a defined failure response.",
    check: ({ report }) => {
      if (report.candidates.length === 0) return { status: "not-applicable", detail: "No candidate designs." };
      const unhandled = report.candidates
        .filter((candidate) => !candidate.generatedMnc.includes("AlarmBlock"))
        .map((candidate) => candidate.name);
      return unhandled.length === 0
        ? { status: "pass", detail: "Every candidate design handles the alarms of its bound devices." }
        : { status: "fail", detail: "A candidate design leaves device alarms unhandled.", elements: unhandled };
    },
  },
  {
    id: "QR-07",
    title: "Generated designs re-validate independently",
    source: "Thesis §5.5.3 — generated artefacts must be checked, not trusted",
    rationale: "The generated control model is re-parsed and re-checked by the language, not by the generator.",
    check: ({ report }) => {
      if (report.candidates.length === 0) return { status: "not-applicable", detail: "No candidate designs." };
      const bad = report.candidates
        .filter((candidate) => !candidate.validation.independentlyParsed || candidate.validation.errors > 0)
        .map((candidate) => `${candidate.name} (${candidate.validation.errors} errors)`);
      return bad.length === 0
        ? { status: "pass", detail: "Every generated design parses and validates cleanly on its own." }
        : { status: "fail", detail: "A generated design does not survive independent validation.", elements: bad };
    },
  },
  {
    id: "QR-08",
    title: "Every candidate carries a complete evidence ledger",
    source: "Thesis §5.5.2 — explainable, traceable design decisions",
    rationale: "Each design decision must name the rule that made it and the model elements it touched.",
    check: ({ report }) => {
      if (report.candidates.length === 0) return { status: "not-applicable", detail: "No candidate designs." };
      const thin = report.candidates
        .filter(
          (candidate) =>
            candidate.evidence.length === 0 ||
            candidate.evidence.some((entry) => !entry.rule || entry.elements.length === 0),
        )
        .map((candidate) => candidate.name);
      return thin.length === 0
        ? { status: "pass", detail: "Every candidate records rule identifiers and the elements they applied to." }
        : { status: "fail", detail: "A candidate has incomplete provenance.", elements: thin };
    },
  },
  {
    id: "QR-09",
    title: "Inputs are complete before synthesis runs",
    source: "Thesis §5.5.2 — missing knowledge must fail loudly",
    rationale: "Synthesis must reject incomplete models rather than assume the missing part.",
    check: ({ report }) => {
      const failed = report.preflight.filter((check) => check.status === "fail").map((check) => check.label);
      return failed.length === 0
        ? { status: "pass", detail: `${report.preflight.length} preflight checks pass.` }
        : { status: "fail", detail: "Synthesis inputs are incomplete.", elements: failed };
    },
  },
  {
    id: "QR-10",
    title: "Model set is within the validated scale",
    source: "Thesis §5.6 — evaluated at approximately 200 devices",
    rationale: "Beyond the evaluated scale, results are reported as unqualified rather than presented as proven.",
    check: ({ workspace }) => {
      const devices = interfacesOf(workspace).length;
      return devices <= VALIDATED_DEVICE_LIMIT
        ? { status: "pass", detail: `${devices} device interfaces, within the validated limit of ${VALIDATED_DEVICE_LIMIT}.` }
        : {
            status: "fail",
            detail: `${devices} device interfaces exceeds the validated limit of ${VALIDATED_DEVICE_LIMIT}.`,
            elements: [],
          };
    },
  },
];

/* ------------------------------------------------------------------ */
/* Properties                                                           */
/* ------------------------------------------------------------------ */

function fingerprint(report: SynthesisReport): string {
  return report.candidates.map((candidate) => `${candidate.id}\n${candidate.generatedMnc}`).join("\n--\n");
}

function relink(files: WorkspaceFile[]): Workspace {
  return linkWorkspace(files);
}

function sourcesOf(workspace: Workspace): WorkspaceFile[] {
  return workspace.files.map((file) => ({ path: file.path, kind: file.kind, source: file.source }));
}

/**
 * A well-formed capability that resolves against a real device but is never
 * referenced by the workflow, so it must not influence the chosen design.
 */
function probeCapability(workspace: Workspace): string {
  const iface = interfacesOf(workspace)[0];
  if (!iface) return "";
  const command = iface.commands[0]?.name;
  const commands = command ? `\n    fireable commands : ${command}` : "";
  return `Capability QualificationProbe compatible component interface ${iface.name} {\n  providesControlCapabilities {${commands}\n  }\n}\n`;
}

function runProperties(workspace: Workspace, baseline: SynthesisReport): PropertyResult[] {
  const results: PropertyResult[] = [];
  const base = fingerprint(baseline);
  const files = sourcesOf(workspace);

  // P-01 determinism
  const again = fingerprint(synthesize(relink(files)));
  results.push({
    id: "P-01",
    title: "Determinism — the same models always produce the same designs",
    status: again === base ? "pass" : "fail",
    detail: again === base ? "Two runs produced byte-identical designs." : "A second run produced a different design.",
  });

  // P-02 adding an ineligible capability must not change the selected design
  const capFile = files.find((file) => file.kind === "cap");
  if (capFile) {
    const withNoise = files.map((file) =>
      file === capFile
        ? {
            ...file,
            source: `${file.source}\n${probeCapability(workspace)}`,
          }
        : file,
    );
    const noisy = fingerprint(synthesize(relink(withNoise)));
    results.push({
      id: "P-02",
      title: "Irrelevance — an unusable capability cannot change the outcome",
      status: noisy === base ? "pass" : "fail",
      detail:
        noisy === base
          ? "Adding a capability that no workflow step uses left the designs unchanged."
          : "Adding an unused capability changed the generated designs.",
    });
  }

  // P-03 reordering independent declarations must not change the outcome
  const dmlFile = files.find((file) => file.kind === "dml");
  if (dmlFile) {
    const blocks = dmlFile.source.split(/\n(?=DataModel )/);
    if (blocks.length > 2) {
      const reordered = [blocks[0], ...blocks.slice(1).reverse()].join("\n");
      const shuffled = fingerprint(
        synthesize(relink(files.map((file) => (file === dmlFile ? { ...file, source: reordered } : file)))),
      );
      results.push({
        id: "P-03",
        title: "Order independence — reordering unrelated declarations changes nothing",
        status: shuffled === base ? "pass" : "fail",
        detail:
          shuffled === base
            ? "Reversing the order of independent data models left the designs unchanged."
            : "Reordering independent declarations changed the generated designs.",
      });
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                          */
/* ------------------------------------------------------------------ */

export function qualify(workspace: Workspace, report: SynthesisReport): QualificationReport {
  const diagram = diagramOf(workspace);
  const rules: RuleResult[] = RULES.map((rule) => {
    const outcome = rule.check({ workspace, report, diagram });
    return {
      id: rule.id,
      title: rule.title,
      source: rule.source,
      rationale: rule.rationale,
      status: outcome.status,
      detail: outcome.detail,
      elements: outcome.elements ?? [],
    };
  });

  const properties = runProperties(workspace, report);
  const rulesFailed = rules.filter((rule) => rule.status === "fail").length;
  const propertiesFailed = properties.filter((property) => property.status === "fail").length;
  const deviceCount = interfacesOf(workspace).length;
  const conformance = runCorpus();
  const notApplicable = rules.filter((rule) => rule.status === "not-applicable").map((rule) => rule.id);

  const blockedReasons: string[] = [];
  if (rulesFailed > 0) blockedReasons.push(`${rulesFailed} qualification rule(s) failed.`);
  if (propertiesFailed > 0) blockedReasons.push(`${propertiesFailed} algorithm property check(s) failed.`);
  if (notApplicable.length > 0)
    blockedReasons.push(`${notApplicable.length} rule(s) could not be checked: ${notApplicable.join(", ")}.`);
  if (!conformance.conformant)
    blockedReasons.push(
      `${conformance.failed} comparison case(s) differ from the desktop KIDE transformation.`,
    );
  if (deviceCount > VALIDATED_DEVICE_LIMIT)
    blockedReasons.push(`Model exceeds the validated scale of ${VALIDATED_DEVICE_LIMIT} devices.`);

  return {
    qualificationVersion: QUALIFICATION_VERSION,
    generator: GENERATOR_VERSION,
    rules,
    properties,
    rulesChecked: rules.filter((rule) => rule.status !== "not-applicable").length,
    rulesFailed,
    propertiesFailed,
    deviceCount,
    withinValidatedScale: deviceCount <= VALIDATED_DEVICE_LIMIT,
    conformance,
    qualified: blockedReasons.length === 0,
    blockedReasons,
  };
}

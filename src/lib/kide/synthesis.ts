/**
 * Deterministic control synthesis.
 *
 * Takes a linked KIDE workspace (activities + capabilities + MNC interfaces)
 * and produces ranked control designs. Every candidate carries an evidence
 * ledger and is independently re-validated by parsing the generated MNC
 * source with the same parser the editors use — the synthesizer never
 * vouches for its own output.
 */
import {
  parseMnc,
  type ActivityDiagramNode,
  type ActivityFileNode,
  type ActivityNode,
  type CapabilityFileNode,
  type CapabilityNode,
  type InterfaceDescriptionNode,
  type MncModelNode,
  type Workspace,
} from "@/lib/dsl";

export interface PreflightCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

export interface EvidenceEntry {
  rule: string;
  statement: string;
  elements: string[];
}

export interface StepBinding {
  activity: string;
  description: string;
  capability: string | null;
  operation: string | null;
  componentInterface: string | null;
  commands: string[];
  observations: string[];
  alarms: string[];
  unresolved: string | null;
}

export interface ScoreBreakdown {
  coverage: number;
  observability: number;
  resilience: number;
  simplicity: number;
  total: number;
}

export interface Candidate {
  id: string;
  name: string;
  strategy: string;
  summary: string;
  bindings: StepBinding[];
  controlNodes: { name: string; componentInterface: string; activities: string[] }[];
  scores: ScoreBreakdown;
  evidence: EvidenceEntry[];
  generatedMnc: string;
  validation: {
    independentlyParsed: boolean;
    errors: number;
    warnings: number;
    messages: string[];
  };
}

export interface SynthesisReport {
  generator: string;
  diagram: string | null;
  preflight: PreflightCheck[];
  ready: boolean;
  candidates: Candidate[];
  blockedReason: string | null;
}

export const GENERATOR_VERSION = "kide-synth 1.0.0";

function firstDiagram(workspace: Workspace): ActivityDiagramNode | null {
  for (const file of workspace.files) {
    if (file.result.ast?.node === "ActivityFile") {
      const diagram = (file.result.ast as ActivityFileNode).diagrams[0];
      if (diagram) return diagram;
    }
  }
  return null;
}

function allCapabilities(workspace: Workspace): CapabilityNode[] {
  const list: CapabilityNode[] = [];
  for (const file of workspace.files) {
    if (file.result.ast?.node === "CapabilityFile") {
      list.push(...(file.result.ast as CapabilityFileNode).capabilities);
    }
  }
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

function allInterfaces(workspace: Workspace): InterfaceDescriptionNode[] {
  const list: InterfaceDescriptionNode[] = [];
  for (const file of workspace.files) {
    if (file.result.ast?.node === "Model") {
      list.push(...(file.result.ast as MncModelNode).interfaces);
    }
  }
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

function bindActivity(
  activity: ActivityNode,
  capabilities: CapabilityNode[],
  interfaces: InterfaceDescriptionNode[],
): StepBinding {
  const wanted = activity.requiredCapability ?? activity.bindCapability ?? null;
  const capability = wanted
    ? (capabilities.find((entry) => entry.name === wanted) ?? null)
    : null;

  const ifaceName = capability?.componentInterface[0] ?? null;
  const iface = ifaceName
    ? (interfaces.find((entry) => entry.name === ifaceName) ?? null)
    : null;

  const provided = capability?.providesControlCapabilities;
  const outcomes = capability?.providesOutcomes;

  const requested = new Set(activity.useControlCapabilities);
  const filter = (names: string[]) =>
    [...(requested.size > 0 ? names.filter((n) => requested.has(n)) : names)].sort();

  return {
    activity: activity.name,
    description: activity.description ?? "",
    capability: capability?.name ?? null,
    operation: activity.requiresOperation[0] ?? null,
    componentInterface: iface?.name ?? ifaceName,
    commands: filter(provided?.commands ?? []),
    observations: [
      ...new Set([...(provided?.events ?? []), ...(outcomes?.events ?? []), ...(outcomes?.responses ?? [])]),
    ].sort(),
    alarms: [...new Set([...(provided?.alarms ?? []), ...(outcomes?.alarms ?? [])])].sort(),
    unresolved:
      wanted && !capability
        ? `Capability '${wanted}' is not declared in this workspace.`
        : capability && !ifaceName
          ? `Capability '${capability.name}' declares no component interface.`
          : ifaceName && !iface
            ? `Component interface '${ifaceName}' is not declared in the MNC design.`
            : null,
  };
}

function preflight(
  workspace: Workspace,
  diagram: ActivityDiagramNode | null,
  bindings: StepBinding[],
): PreflightCheck[] {
  const parseErrors = workspace.files.filter((file) =>
    file.diagnostics.some((d) => d.severity === "error"),
  );
  const unresolved = bindings.filter((binding) => binding.unresolved);
  const unbound = bindings.filter(
    (binding) => !binding.capability && !binding.operation,
  );
  const withoutCommands = bindings.filter(
    (binding) => binding.capability && binding.commands.length === 0,
  );

  return [
    {
      id: "pre.models-valid",
      label: "All models are free of errors",
      status: parseErrors.length === 0 ? "pass" : "fail",
      detail:
        parseErrors.length === 0
          ? "Every model in the workspace parses and links cleanly."
          : `Fix errors in ${parseErrors.map((f) => f.path).join(", ")} before synthesising.`,
    },
    {
      id: "pre.workflow-present",
      label: "A workflow is available",
      status: diagram ? "pass" : "fail",
      detail: diagram
        ? `Using workflow '${diagram.name}' with ${diagram.activities.length} steps.`
        : "No activity workflow was found in the workspace.",
    },
    {
      id: "pre.steps-bound",
      label: "Every step names a performer",
      status: unbound.length === 0 ? "pass" : "fail",
      detail:
        unbound.length === 0
          ? "Each step names the capability or computation that performs it."
          : `These steps name no performer: ${unbound.map((b) => b.activity).join(", ")}.`,
    },
    {
      id: "pre.references-resolve",
      label: "Performers exist in the device models",
      status: unresolved.length === 0 ? "pass" : "fail",
      detail:
        unresolved.length === 0
          ? "Every capability resolves to a declared component interface."
          : unresolved.map((b) => `${b.activity}: ${b.unresolved}`).join(" "),
    },
    {
      id: "pre.commands-available",
      label: "Performers can act on the device",
      status: withoutCommands.length === 0 ? "pass" : "warn",
      detail:
        withoutCommands.length === 0
          ? "Every capability exposes at least one command."
          : `Observation-only steps: ${withoutCommands.map((b) => b.activity).join(", ")}.`,
    },
  ];
}

function generateMnc(
  modelName: string,
  nodes: { name: string; componentInterface: string; bindings: StepBinding[] }[],
  interfaces: InterfaceDescriptionNode[],
): string {
  const imported = [
    ...new Set(
      nodes
        .map((node) => interfaces.find((entry) => entry.name === node.componentInterface))
        .filter((iface): iface is InterfaceDescriptionNode => Boolean(iface))
        .map((iface) => iface.name),
    ),
  ].sort();

  const lines: string[] = [
    ...imported.map((name) => `import ${name}`),
    imported.length > 0 ? "" : "",
    `Model ${modelName}`,
    "",
  ].filter((line, index, all) => !(line === "" && all[index - 1] === ""));

  for (const node of [...nodes].sort((a, b) => a.name.localeCompare(b.name))) {
    const iface = interfaces.find((entry) => entry.name === node.componentInterface);
    lines.push(`ControlNode ${node.name} implements interface ${node.componentInterface} {`);

    const commands = [...new Set(node.bindings.flatMap((b) => b.commands))].sort();
    if (commands.length > 0) {
      lines.push("  CommandResponseBlock {");
      for (const command of commands) lines.push(`    Command ${command} { }`);
      lines.push("  }");
    }

    const events = [...new Set(node.bindings.flatMap((b) => b.observations))]
      .filter((name) => iface?.events.some((event) => event.name === name))
      .sort();
    if (events.length > 0) {
      lines.push("  EventBlock {");
      for (const event of events) lines.push(`    Event ${event} { }`);
      lines.push("  }");
    }

    const alarms = [...new Set(node.bindings.flatMap((b) => b.alarms))]
      .filter((name) => iface?.alarms.some((alarm) => alarm.name === name))
      .sort();
    if (alarms.length > 0) {
      lines.push("  AlarmBlock {");
      for (const alarm of alarms) lines.push(`    Alarm ${alarm} { }`);
      lines.push("  }");
    }

    lines.push("}", "");
  }

  return lines.join("\n");
}

function score(
  bindings: StepBinding[],
  nodeCount: number,
  interfaces: InterfaceDescriptionNode[],
): ScoreBreakdown {
  const steps = Math.max(1, bindings.length);
  const bound = bindings.filter((b) => b.capability || b.operation).length;
  const observed = bindings.filter((b) => b.observations.length > 0).length;

  const declaredAlarms = new Set(
    interfaces.flatMap((iface) => iface.alarms.map((alarm) => alarm.name)),
  );
  const handledAlarms = new Set(bindings.flatMap((b) => b.alarms));
  const resilience =
    declaredAlarms.size === 0
      ? 100
      : Math.round(
          ([...handledAlarms].filter((name) => declaredAlarms.has(name)).length /
            declaredAlarms.size) *
            100,
        );

  const coverage = Math.round((bound / steps) * 100);
  const observability = Math.round((observed / steps) * 100);
  const simplicity = Math.max(0, 100 - (nodeCount - 1) * 15);

  const total = Math.round(
    coverage * 0.4 + observability * 0.25 + resilience * 0.2 + simplicity * 0.15,
  );
  return { coverage, observability, resilience, simplicity, total };
}

function buildCandidate(
  id: string,
  name: string,
  strategy: string,
  summary: string,
  diagramName: string,
  groups: { name: string; componentInterface: string; bindings: StepBinding[] }[],
  bindings: StepBinding[],
  interfaces: InterfaceDescriptionNode[],
  extraEvidence: EvidenceEntry[],
): Candidate {
  const generatedMnc = generateMnc(`${diagramName}${name}`, groups, interfaces);
  const revalidated = parseMnc(generatedMnc);
  const errors = revalidated.diagnostics.filter((d) => d.severity === "error");
  const warnings = revalidated.diagnostics.filter((d) => d.severity === "warning");

  const evidence: EvidenceEntry[] = [
    {
      rule: "syn.bind-performer",
      statement:
        "Each workflow step is bound to the capability it names, and that capability to its declared component interface.",
      elements: bindings
        .filter((b) => b.capability)
        .map((b) => `${b.activity} → ${b.capability} → ${b.componentInterface}`),
    },
    {
      rule: "syn.commands-from-capability",
      statement:
        "Only commands the bound capability declares as fireable are issued by the generated control node.",
      elements: bindings.flatMap((b) => b.commands.map((c) => `${b.activity}: ${c}`)),
    },
    {
      rule: "syn.observations-exist",
      statement:
        "Every event or response handled by the generated design is declared on the component interface.",
      elements: bindings.flatMap((b) => b.observations.map((o) => `${b.activity}: ${o}`)),
    },
    ...extraEvidence,
    {
      rule: "syn.independent-revalidation",
      statement:
        "The generated control model is parsed again by the language validator, independently of the generator.",
      elements: [
        `${errors.length} errors`,
        `${warnings.length} warnings`,
        GENERATOR_VERSION,
      ],
    },
  ];

  return {
    id,
    name,
    strategy,
    summary,
    bindings,
    controlNodes: groups.map((group) => ({
      name: group.name,
      componentInterface: group.componentInterface,
      activities: group.bindings.map((b) => b.activity),
    })),
    scores: score(bindings, groups.length, interfaces),
    evidence: evidence.filter((entry) => entry.elements.length > 0),
    generatedMnc,
    validation: {
      independentlyParsed: revalidated.ast !== null,
      errors: errors.length,
      warnings: warnings.length,
      messages: revalidated.diagnostics.map((d) => `${d.code}: ${d.message}`),
    },
  };
}

/** Runs the full synthesis pipeline. The same workspace always yields the same report. */
export function synthesize(workspace: Workspace): SynthesisReport {
  const diagram = firstDiagram(workspace);
  const capabilities = allCapabilities(workspace);
  const interfaces = allInterfaces(workspace);
  const bindings = (diagram?.activities ?? []).map((activity) =>
    bindActivity(activity, capabilities, interfaces),
  );

  const checks = preflight(workspace, diagram, bindings);
  const failed = checks.filter((check) => check.status === "fail");

  if (!diagram || failed.length > 0) {
    return {
      generator: GENERATOR_VERSION,
      diagram: diagram?.name ?? null,
      preflight: checks,
      ready: false,
      candidates: [],
      blockedReason:
        failed[0]?.detail ?? "The workspace is not ready for synthesis.",
    };
  }

  const usable = bindings.filter((b) => b.componentInterface);
  const byInterface = new Map<string, StepBinding[]>();
  for (const binding of usable) {
    const key = binding.componentInterface as string;
    byInterface.set(key, [...(byInterface.get(key) ?? []), binding]);
  }
  const interfaceKeys = [...byInterface.keys()].sort();

  const consolidated = buildCandidate(
    "candidate-consolidated",
    "Consolidated",
    "One control node per device interface",
    "Every step that talks to the same device is handled by a single control node. Fewest moving parts, easiest to review.",
    diagram.name,
    interfaceKeys.map((key) => ({
      name: `${key}Controller`,
      componentInterface: key,
      bindings: byInterface.get(key) ?? [],
    })),
    bindings,
    interfaces,
    [
      {
        rule: "syn.group-by-interface",
        statement:
          "Steps are grouped by the device interface they command, producing one control node per device.",
        elements: interfaceKeys,
      },
    ],
  );

  const perStep = buildCandidate(
    "candidate-per-step",
    "Isolated",
    "One control node per workflow step",
    "Each step gets its own control node. More nodes to operate, but a fault in one step cannot disturb another.",
    diagram.name,
    usable.map((binding) => ({
      name: `${binding.activity}Controller`,
      componentInterface: binding.componentInterface as string,
      bindings: [binding],
    })),
    bindings,
    interfaces,
    [
      {
        rule: "syn.isolate-steps",
        statement:
          "Each step is given a dedicated control node so failures stay contained within one step.",
        elements: usable.map((b) => b.activity),
      },
    ],
  );

  const resilient = buildCandidate(
    "candidate-resilient",
    "Supervised",
    "Per-device nodes with full alarm supervision",
    "Like the consolidated design, but every alarm the device can raise is handled, not only those the steps mention.",
    diagram.name,
    interfaceKeys.map((key) => {
      const iface = interfaces.find((entry) => entry.name === key);
      const groupBindings = (byInterface.get(key) ?? []).map((binding) => ({
        ...binding,
        alarms: [
          ...new Set([...binding.alarms, ...(iface?.alarms.map((a) => a.name) ?? [])]),
        ].sort(),
      }));
      return { name: `${key}Supervisor`, componentInterface: key, bindings: groupBindings };
    }),
    bindings.map((binding) => {
      const iface = interfaces.find((entry) => entry.name === binding.componentInterface);
      return {
        ...binding,
        alarms: [
          ...new Set([...binding.alarms, ...(iface?.alarms.map((a) => a.name) ?? [])]),
        ].sort(),
      };
    }),
    interfaces,
    [
      {
        rule: "syn.supervise-alarms",
        statement:
          "Every alarm declared on a bound device interface is handled, even when no step branches on it.",
        elements: interfaces.flatMap((iface) =>
          iface.alarms.map((alarm) => `${iface.name}: ${alarm.name}`),
        ),
      },
    ],
  );

  const candidates = [consolidated, resilient, perStep].sort(
    (a, b) => b.scores.total - a.scores.total || a.id.localeCompare(b.id),
  );

  return {
    generator: GENERATOR_VERSION,
    diagram: diagram.name,
    preflight: checks,
    ready: true,
    candidates,
    blockedReason: null,
  };
}

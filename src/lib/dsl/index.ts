import { parseActivity } from "./activity";
import { parseCapability } from "./capability";
import { parseDml } from "./dml";
import { parseMnc } from "./mnc";
import { parseOperation } from "./operation";
import type {
  ActivityFileNode,
  CapabilityFileNode,
  DataPackageNode,
  Diagnostic,
  DslKind,
  MncModelNode,
  OperationDescriptionsNode,
  ParseResult,
  RefKind,
} from "./ast";

export * from "./ast";
export { parseActivity, parseCapability, parseDml, parseMnc, parseOperation };
export { tokenize } from "./lexer";

export const DSL_LANGUAGES: {
  kind: DslKind;
  extension: string;
  label: string;
  description: string;
}[] = [
  {
    kind: "dml",
    extension: ".dml",
    label: "Data model",
    description: "Data structures exchanged between devices and control logic.",
  },
  {
    kind: "op",
    extension: ".op",
    label: "Operations",
    description: "Callable computations with typed inputs and one result.",
  },
  {
    kind: "mncspec",
    extension: ".mncspec",
    label: "MNC design",
    description: "Device interfaces and the control nodes that command them.",
  },
  {
    kind: "cap",
    extension: ".cap",
    label: "Capability",
    description: "What a device can do, bound to concrete interface items.",
  },
  {
    kind: "activity",
    extension: ".activity",
    label: "Activity workflow",
    description: "Ordered activities, conditions and failure continuations.",
  },
];

/** Keywords per language, used for editor highlighting and completion. */
export const DSL_KEYWORDS: Record<DslKind, string[]> = {
  dml: ["Package", "DataModel", "primitives", "composites", "int", "boolean", "float", "string", "object", "date", "true", "false"],
  op: ["Operation", "execute", "return", "int", "boolean", "float", "string", "object", "date"],
  mncspec: [
    "import", "Model", "InterfaceDescription", "ControlNode", "implements", "interface", "uses",
    "port", "IPaddress", "commands", "events", "alarms", "responses", "dataPoints",
    "operatingStates", "startStates", "endStates", "SubscribableItemList", "subscribedEvents",
    "subscribedAlarms", "subscribedDataPoints", "async", "Publish", "level", "childNodes",
    "CommandResponseBlock", "EventBlock", "AlarmBlock", "DataPointBlock", "Command", "Event",
    "Alarm", "DataPoint", "Generate", "Response", "expectedResponse", "ResponseAggregation",
    "received", "Responses", "parameterTranslations", "inputParameters", "translatedParameters",
    "Action", "raise", "fire", "generate", "trigger", "execute", "transition", "states",
    "currentState", "nextState", "entryAction", "exitAction", "any", "Validate", "onFail",
    "onSuccess", "parameters", "operation", "Max", "Min", "Value", "Possible", "Values",
    "and", "or", "expected",
  ],
  cap: [
    "Capability", "compatible", "component", "interface", "Init", "subscribe", "fire", "execute",
    "Commands", "Operations", "alarms", "events", "data", "providesControlCapabilities",
    "providesOutcomes", "fireable", "commands", "receivable", "raised", "subscribable",
    "DataPoints", "responses", "dataPoints", "responses=>",
  ],
  activity: [
    "ActivityDiagram", "uses", "Objects", "on", "context", "physical", "contexts", "produces",
    "results", "has", "activities", "Activity", "description", "inputData", "requireCapability",
    "requireOperation", "childActivityDiagram", "conditions", "nextActivity", "nextActivityDiagram",
    "time", "interruptedBy", "interrupts", "from", "if", "outcome", "is", "final", "result",
    "and", "or", "secs", "mins", "hrs", "days",
  ],
};

export function dslKindForPath(path: string): DslKind | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".dml")) return "dml";
  if (lower.endsWith(".op")) return "op";
  if (lower.endsWith(".mncspec")) return "mncspec";
  if (lower.endsWith(".cap")) return "cap";
  if (lower.endsWith(".activity")) return "activity";
  return null;
}

export function parseDsl(kind: DslKind, source: string): ParseResult {
  switch (kind) {
    case "dml":
      return parseDml(source);
    case "op":
      return parseOperation(source);
    case "mncspec":
      return parseMnc(source);
    case "cap":
      return parseCapability(source);
    case "activity":
      return parseActivity(source);
  }
}

/* ------------------------------------------------------------------ */
/* Workspace-level linking                                             */
/* ------------------------------------------------------------------ */

export interface WorkspaceFile {
  path: string;
  kind: DslKind;
  source: string;
}

export interface LinkedFile {
  path: string;
  kind: DslKind;
  /** The exact source text this file was parsed from. */
  source: string;
  result: ParseResult;
  diagnostics: Diagnostic[];
}

export interface Workspace {
  files: LinkedFile[];
  symbols: Record<RefKind, Set<string>>;
  errorCount: number;
  warningCount: number;
}

const REF_KINDS: RefKind[] = [
  "dataModel", "parameter", "command", "event", "alarm", "dataPoint", "response",
  "operation", "capability", "activity", "activityDiagram", "interface", "controlNode",
  "operatingState", "interfaceItem", "outcomeItem",
];

const REF_LABEL: Record<RefKind, string> = {
  dataModel: "data model",
  parameter: "parameter",
  command: "command",
  event: "event",
  alarm: "alarm",
  dataPoint: "data point",
  response: "response",
  operation: "operation",
  capability: "capability",
  activity: "activity",
  activityDiagram: "activity diagram",
  interface: "component interface",
  controlNode: "control node",
  operatingState: "operating state",
  interfaceItem: "interface item",
  outcomeItem: "capability outcome",
};

function emptySymbols(): Record<RefKind, Set<string>> {
  const symbols = {} as Record<RefKind, Set<string>>;
  for (const kind of REF_KINDS) symbols[kind] = new Set<string>();
  return symbols;
}

/**
 * Parses every file and resolves cross-model references between them.
 * A reference is only reported as unresolved when the workspace actually
 * declares symbols of that category, so a partial workspace stays quiet.
 */
export function linkWorkspace(files: WorkspaceFile[]): Workspace {
  const symbols = emptySymbols();
  const parsed: LinkedFile[] = files.map((file) => ({
    path: file.path,
    kind: file.kind,
    source: file.source,
    result: parseDsl(file.kind, file.source),
    diagnostics: [],
  }));

  for (const file of parsed) {
    const ast = file.result.ast;
    if (!ast) continue;

    if (ast.node === "DataPackage") {
      const pkg = ast as DataPackageNode;
      for (const model of pkg.dataModels) {
        symbols.dataModel.add(model.name);
        for (const parameter of model.primitives) symbols.parameter.add(parameter.name);
      }
    } else if (ast.node === "OperationDescriptions") {
      const ops = ast as OperationDescriptionsNode;
      for (const operation of ops.operations) {
        symbols.operation.add(operation.name);
        for (const parameter of operation.inputParameters) symbols.parameter.add(parameter.name);
        if (operation.outputParameter) symbols.parameter.add(operation.outputParameter.name);
      }
    } else if (ast.node === "Model") {
      const model = ast as MncModelNode;
      for (const iface of model.interfaces) {
        symbols.interface.add(iface.name);
        for (const command of iface.commands) {
          symbols.command.add(command.name);
          symbols.interfaceItem.add(command.name);
        }
        for (const event of iface.events) {
          symbols.event.add(event.name);
          symbols.interfaceItem.add(event.name);
          symbols.outcomeItem.add(event.name);
        }
        for (const alarm of iface.alarms) {
          symbols.alarm.add(alarm.name);
          symbols.interfaceItem.add(alarm.name);
          symbols.outcomeItem.add(alarm.name);
        }
        for (const dataPoint of iface.dataPoints) {
          symbols.dataPoint.add(dataPoint.name);
          symbols.interfaceItem.add(dataPoint.name);
          symbols.outcomeItem.add(dataPoint.name);
        }
        for (const response of iface.responses) {
          symbols.response.add(response.name);
          symbols.outcomeItem.add(response.name);
        }
        for (const state of iface.operatingStates?.operatingStates ?? []) {
          symbols.operatingState.add(state.name);
        }
        for (const list of [iface.commands, iface.events, iface.alarms, iface.responses, iface.dataPoints]) {
          for (const item of list) {
            for (const parameter of item.parameters) symbols.parameter.add(parameter.name);
          }
        }
      }
      for (const controlNode of model.controlNodes) symbols.controlNode.add(controlNode.name);
    } else if (ast.node === "CapabilityFile") {
      for (const capability of (ast as CapabilityFileNode).capabilities) {
        symbols.capability.add(capability.name);
      }
    } else if (ast.node === "ActivityFile") {
      for (const diagram of (ast as ActivityFileNode).diagrams) {
        symbols.activityDiagram.add(diagram.name);
        for (const activity of diagram.activities) symbols.activity.add(activity.name);
        for (const result of diagram.results) symbols.parameter.add(result.name);
      }
    }
  }

  for (const file of parsed) {
    file.diagnostics = [...file.result.diagnostics];
    for (const reference of file.result.references) {
      const table = symbols[reference.kind];
      if (table.size === 0) continue; // nothing of this category modelled yet
      const simple = reference.name.split(".").pop() ?? reference.name;
      if (table.has(reference.name) || table.has(simple)) continue;
      file.diagnostics.push({
        severity: "error",
        message: `Unknown ${REF_LABEL[reference.kind]} '${reference.name}'. Declare it, import the model that defines it, or correct the name.`,
        code: `link.unknown-${reference.kind}`,
        line: reference.line,
        column: reference.column,
        offset: reference.offset,
        length: reference.length,
      });
    }
    file.diagnostics.sort((a, b) => a.offset - b.offset);
  }

  let errorCount = 0;
  let warningCount = 0;
  for (const file of parsed) {
    for (const diagnostic of file.diagnostics) {
      if (diagnostic.severity === "error") errorCount += 1;
      if (diagnostic.severity === "warning") warningCount += 1;
    }
  }

  return { files: parsed, symbols, errorCount, warningCount };
}

export * from "./samples";

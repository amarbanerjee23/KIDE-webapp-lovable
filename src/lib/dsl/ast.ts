/** Shared AST and diagnostic types for the KIDE DSL family. */

export type DslKind = "dml" | "op" | "mncspec" | "cap" | "activity";

export type Severity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: Severity;
  message: string;
  /** Stable rule identifier, used by the evidence ledger. */
  code: string;
  line: number;
  column: number;
  offset: number;
  length: number;
}

export interface SourceRange {
  line: number;
  column: number;
  offset: number;
  length: number;
}

/** Categories of cross-model reference the KIDE grammars can express. */
export type RefKind =
  | "dataModel"
  | "parameter"
  | "command"
  | "event"
  | "alarm"
  | "dataPoint"
  | "response"
  | "operation"
  | "capability"
  | "activity"
  | "activityDiagram"
  | "interface"
  | "controlNode"
  | "operatingState"
  | "interfaceItem"
  | "outcomeItem";

export interface Reference extends SourceRange {
  kind: RefKind;
  name: string;
}

export interface Named extends SourceRange {
  name: string;
}

/* ------------------------------------------------------------------ */
/* Data model (Dml.xtext)                                              */
/* ------------------------------------------------------------------ */

export type PrimitiveValueType =
  | "int"
  | "boolean"
  | "float"
  | "string"
  | "object"
  | "date";

export const PRIMITIVE_VALUE_TYPES: PrimitiveValueType[] = [
  "int",
  "boolean",
  "float",
  "string",
  "object",
  "date",
];

export type PrimitiveValue =
  | { kind: "int"; value: number }
  | { kind: "float"; value: number }
  | { kind: "string"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "date"; day: number; month: number; year: number }
  | { kind: "array"; values: PrimitiveValue[] }
  | { kind: "object"; value: string };

export interface SimpleTypeNode extends Named {
  node: "SimpleType";
  type: PrimitiveValueType;
  value?: PrimitiveValue | undefined;
}

export interface AbstractTypeNode extends Named {
  node: "AbstractType";
  typeRef: string;
  value?: string | undefined;
}

export interface ArrayTypeNode extends Named {
  node: "ArrayType";
  primitiveType?: PrimitiveValueType | undefined;
  dataModelType?: string | undefined;
  values: PrimitiveValue[];
}

export type ParameterNode = SimpleTypeNode | AbstractTypeNode | ArrayTypeNode;

export interface DataModelNode extends Named {
  node: "DataModel";
  primitives: ParameterNode[];
  composites: string[];
}

export interface DataPackageNode {
  node: "DataPackage";
  name?: string | undefined;
  dataModels: DataModelNode[];
}

/* ------------------------------------------------------------------ */
/* Operations (Operation.xtext)                                        */
/* ------------------------------------------------------------------ */

export interface OperationNode extends Named {
  node: "Operation";
  inputParameters: ParameterNode[];
  executableScript?: string | undefined;
  outputParameter?: ParameterNode | undefined;
}

export interface OperationDescriptionsNode {
  node: "OperationDescriptions";
  operations: OperationNode[];
}

/* ------------------------------------------------------------------ */
/* MNC (Mnc.xtext)                                                     */
/* ------------------------------------------------------------------ */

export interface CommandNode extends Named {
  node: "Command";
  asynch: boolean;
  parameters: ParameterNode[];
}

export interface EventNode extends Named {
  node: "Event";
  publish: boolean;
  parameters: ParameterNode[];
}

export interface ResponseNode extends Named {
  node: "Response";
  parameters: ParameterNode[];
}

export interface AlarmNode extends Named {
  node: "Alarm";
  publish: boolean;
  parameters: ParameterNode[];
  level?: number | undefined;
}

export interface DataPointNode extends Named {
  node: "DataPoint";
  publish: boolean;
  type?: PrimitiveValueType | undefined;
  value?: PrimitiveValue | undefined;
  parameters: ParameterNode[];
}

export interface OperatingStateNode extends Named {
  node: "OperatingState";
  parameters: ParameterNode[];
}

export interface OperatingStateUtilityNode {
  node: "OperatingStateUtility";
  operatingStates: OperatingStateNode[];
  startStates: string[];
  endStates: string[];
}

export interface SubscribableItemListNode {
  node: "SubscribableItemList";
  subscribedEvents: string[];
  subscribedAlarms: string[];
  subscribedDataPoints: string[];
}

export interface PortNode extends Named {
  node: "Port";
  value?: number | undefined;
}

export interface ActionRefNode {
  ref: string;
  parameterValues: PrimitiveValue[];
  parameterMappings: ParameterTranslationNode[];
  /** Only for ActionCommand: `-> expected` response blocks. */
  responseHandling?: ResponseBlockNode[] | undefined;
}

export interface ActionNode {
  node: "Action";
  raiseAlarm: ActionRefNode[];
  fireCommand: ActionRefNode[];
  publishEvent: ActionRefNode[];
  triggerDataPoint: ActionRefNode[];
  executeOperation: ActionRefNode[];
  transitionStates: TransitionNode[];
}

export interface TransitionNode {
  node: "Transition";
  currentState: string[];
  any: boolean;
  exitAction?: ActionNode | undefined;
  nextState: string;
  entryAction?: ActionNode | undefined;
}

export interface ParameterTranslationNode {
  node: "ParameterTranslation";
  inputParameters: string[];
  translatedParameter: string;
}

export interface CheckParameterConditionNode {
  node: "CheckParameterCondition";
  mode: "parameters" | "operation";
  operation?: string | undefined;
  parameters: string[];
  checkMaxValue?: PrimitiveValue | undefined;
  checkMinValue?: PrimitiveValue | undefined;
  checkValues: PrimitiveValue[];
}

export interface ValidationNode {
  node: "Validation";
  rules: CheckParameterConditionNode[];
  operators: string[];
  onFail?: ActionNode | undefined;
  onSuccess?: ActionNode | undefined;
}

export interface ResponseAggregationRuleNode {
  node: "ResponseAggregationRule";
  inputResponses: string[];
  operators: string[];
  parameterTranslations: ParameterTranslationNode[];
}

export interface ResponseBlockNode {
  node: "ResponseBlock";
  response: string;
  action?: ActionNode | undefined;
  validationRules: ValidationNode[];
  responseAggregationRules: ResponseAggregationRuleNode[];
}

export interface CommandResponseBlockNode {
  node: "CommandResponseBlock";
  command: string;
  action?: ActionNode | undefined;
  validationRules: ValidationNode[];
  responseBlocks: ResponseBlockNode[];
}

export interface HandlerBlockNode {
  node: "EventBlock" | "AlarmBlock" | "DataPointBlock";
  refs: string[];
  action?: ActionNode | undefined;
  validationRules: ValidationNode[];
}

export interface InterfaceDescriptionNode extends Named {
  node: "InterfaceDescription";
  uses: string[];
  port?: PortNode | undefined;
  dataPoints: DataPointNode[];
  alarms: AlarmNode[];
  commands: CommandNode[];
  events: EventNode[];
  responses: ResponseNode[];
  operatingStates?: OperatingStateUtilityNode | undefined;
  subscribedItems?: SubscribableItemListNode | undefined;
  ipaddress?: string | undefined;
}

export interface ControlNodeNode extends Named {
  node: "ControlNode";
  interfaceDescription: string;
  childNodes: string[];
  commandResponseBlocks: CommandResponseBlockNode[];
  eventBlocks: HandlerBlockNode[];
  alarmBlocks: HandlerBlockNode[];
  dataPointBlocks: HandlerBlockNode[];
}

export interface MncModelNode {
  node: "Model";
  imports: string[];
  name: string;
  interfaces: InterfaceDescriptionNode[];
  controlNodes: ControlNodeNode[];
}

/* ------------------------------------------------------------------ */
/* Capability (Capability.xtext)                                       */
/* ------------------------------------------------------------------ */

export interface ControlCapabilitiesNode {
  node: "ControlCapabilities";
  commands: string[];
  events: string[];
  alarms: string[];
  dataPoints: string[];
}

export interface CapabilitiesOutcomeNode {
  node: "CapabilitiesOutcome";
  responses: string[];
  events: string[];
  alarms: string[];
  dataPoints: string[];
}

export interface CapabilityNode extends Named {
  node: "Capability";
  componentInterface: string[];
  requiredInitProcess?: ActionNode | undefined;
  providesControlCapabilities?: ControlCapabilitiesNode | undefined;
  providesOutcomes?: CapabilitiesOutcomeNode | undefined;
}

export interface CapabilityFileNode {
  node: "CapabilityFile";
  capabilities: CapabilityNode[];
}

/* ------------------------------------------------------------------ */
/* Activity (ActivityDsl.xtext)                                        */
/* ------------------------------------------------------------------ */

export type UnitTime = "secs" | "mins" | "hrs" | "days";

export interface ActivityCheckConditionNode {
  node: "ActivityCheckParameterCondition";
  parameter: string;
  checkMaxValue?: PrimitiveValue | undefined;
  checkMinValue?: PrimitiveValue | undefined;
  checkValues: PrimitiveValue[];
}

export interface OutcomeNode {
  node: "Outcome";
  capabilityOutcome?: string | undefined;
  validations: ActivityCheckConditionNode[];
}

export interface ConditionalActivityNode {
  node: "ConditionalActivity";
  outcomes: OutcomeNode[];
  operators: string[];
  onTrueNextActivity?: string | undefined;
  onTrueFinalResult?: string | undefined;
}

export interface ActivityNode extends Named {
  node: "Activity";
  description?: string | undefined;
  inputParameters: string[];
  requiredCapability?: string | undefined;
  bindCapability?: string | undefined;
  useControlCapabilities: string[];
  requiresOperation: string[];
  childActivityDiagram?: string | undefined;
  conditionalActivity: ConditionalActivityNode[];
  nextActivity?: string | undefined;
  nextActivityDiagram?: string | undefined;
  time?: number | undefined;
  unit?: UnitTime | undefined;
  interruptedBy: string[];
  interrupts: string[];
}

export interface ActivityDiagramNode extends Named {
  node: "ActivityDiagram";
  dataObjects: string[];
  contextDataModel: string[];
  physicalContext: string[];
  results: ParameterNode[];
  activities: ActivityNode[];
}

export interface ActivityFileNode {
  node: "ActivityFile";
  diagrams: ActivityDiagramNode[];
}

/* ------------------------------------------------------------------ */
/* Parse results                                                       */
/* ------------------------------------------------------------------ */

export type DslRoot =
  | DataPackageNode
  | OperationDescriptionsNode
  | MncModelNode
  | CapabilityFileNode
  | ActivityFileNode;

export interface ParseResult<T extends DslRoot = DslRoot> {
  kind: DslKind;
  ast: T | null;
  diagnostics: Diagnostic[];
  references: Reference[];
}

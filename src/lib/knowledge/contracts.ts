export const KIDE_ONTOLOGY_IRI = "https://kide.dev/ontology/capability";

export type KnowledgeScope = "global" | "project";

export type KnowledgeNodeKind =
  | "Project"
  | "Device"
  | "Interface"
  | "Behavior"
  | "Interaction"
  | "Capability"
  | "CapabilityInvocation"
  | "Workflow"
  | "Activity"
  | "SessionType"
  | "Action"
  | "Precondition"
  | "Postcondition"
  | "Context"
  | "DataModel"
  | "Parameter"
  | "Operation"
  | "ControlModel"
  | "ControlNode"
  | "Command"
  | "Response"
  | "Event"
  | "Alarm"
  | "DataPoint"
  | "OperatingState";

export type KnowledgeEdgeKind =
  | "containsDataModel"
  | "containsControlModel"
  | "containsWorkflow"
  | "containsCapability"
  | "containsOperation"
  | "hasParameter"
  | "hasControlNode"
  | "hasInterface"
  | "bindsInterface"
  | "exposesCommand"
  | "emitsEvent"
  | "raisesAlarm"
  | "exposesDataPoint"
  | "returnsResponse"
  | "hasOperatingState"
  | "hasBehavior"
  | "realizesInterfaceItem"
  | "hasContext"
  | "hasPrecondition"
  | "hasPostcondition"
  | "hasActivities"
  | "requiredCapability"
  | "requiresOperation"
  | "usesDataModel"
  | "nextActivity"
  | "fulfilledBy"
  | "hasCapability"
  | "implementsSession"
  | "hasInteractions"
  | "invokesCapability"
  | "offersCapability";

export type KnowledgePropertyValue = string | number | boolean | string[];

export interface KnowledgeNode {
  id: string;
  kind: KnowledgeNodeKind;
  label: string;
  scope: KnowledgeScope;
  projectId?: string;
  sourcePath?: string | undefined;
  properties: Record<string, KnowledgePropertyValue>;
}

export interface KnowledgeEdge {
  id: string;
  kind: KnowledgeEdgeKind;
  from: string;
  to: string;
  scope: KnowledgeScope;
  projectId?: string;
  properties: Record<string, KnowledgePropertyValue>;
}

export interface KnowledgeDiagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  entityId?: string;
  sourcePath?: string;
}

export interface KnowledgeProjection {
  schemaVersion: 1;
  ontologyIri: typeof KIDE_ONTOLOGY_IRI;
  scope: "project";
  projectId: string;
  generatedAt: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  diagnostics: KnowledgeDiagnostic[];
}

export interface KnowledgeGraphStatus {
  configured: boolean;
  backend: "janusgraph";
  endpoint: string | null;
}

export interface KnowledgeGraphSummary {
  nodeCount: number;
  edgeCount: number;
  errorCount: number;
  warningCount: number;
  byKind: Partial<Record<KnowledgeNodeKind, number>>;
}

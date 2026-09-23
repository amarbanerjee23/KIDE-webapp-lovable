import type {
  ActivityFileNode,
  CapabilityFileNode,
  DataPackageNode,
  MncModelNode,
  Named,
  OperationDescriptionsNode,
  RefKind,
  Reference,
} from "./ast";
import type { Workspace } from "./index";

export interface WorkspaceSymbolLocation {
  kind: RefKind;
  name: string;
  path: string;
  line: number;
  column: number;
  offset: number;
  length: number;
}

export interface WorkspaceReferenceLocation extends WorkspaceSymbolLocation {
  declaration: false;
}

export interface WorkspaceDefinitionLocation extends WorkspaceSymbolLocation {
  declaration: true;
}

export type WorkspaceLanguageLocation = WorkspaceDefinitionLocation | WorkspaceReferenceLocation;

export interface WorkspaceLanguageIndex {
  definitions: WorkspaceDefinitionLocation[];
  references: WorkspaceReferenceLocation[];
}

const KIND_COMPATIBILITY: Partial<Record<RefKind, RefKind[]>> = {
  command: ["command", "interfaceItem"],
  event: ["event", "interfaceItem", "outcomeItem"],
  alarm: ["alarm", "interfaceItem", "outcomeItem"],
  dataPoint: ["dataPoint", "interfaceItem", "outcomeItem"],
  response: ["response", "outcomeItem"],
  interfaceItem: ["interfaceItem", "command", "event", "alarm", "dataPoint"],
  outcomeItem: ["outcomeItem", "event", "alarm", "dataPoint", "response"],
};

function simpleName(name: string): string {
  return name.split(".").pop() ?? name;
}

function addDefinition(
  out: WorkspaceDefinitionLocation[],
  path: string,
  kinds: RefKind[],
  node: Named,
) {
  for (const kind of kinds) {
    out.push({
      kind,
      name: node.name,
      path,
      line: node.line,
      column: node.column,
      offset: node.offset,
      length: node.length,
      declaration: true,
    });
  }
}

function addParameters(out: WorkspaceDefinitionLocation[], path: string, parameters: Named[]) {
  for (const parameter of parameters) {
    addDefinition(out, path, ["parameter"], parameter);
  }
}

function collectDefinitions(workspace: Workspace): WorkspaceDefinitionLocation[] {
  const definitions: WorkspaceDefinitionLocation[] = [];

  for (const file of workspace.files) {
    const ast = file.result.ast;
    if (!ast) continue;

    if (ast.node === "DataPackage") {
      for (const model of (ast as DataPackageNode).dataModels) {
        addDefinition(definitions, file.path, ["dataModel"], model);
        addParameters(definitions, file.path, model.primitives);
      }
      continue;
    }

    if (ast.node === "OperationDescriptions") {
      for (const operation of (ast as OperationDescriptionsNode).operations) {
        addDefinition(definitions, file.path, ["operation"], operation);
        addParameters(definitions, file.path, operation.inputParameters);
        if (operation.outputParameter) {
          addParameters(definitions, file.path, [operation.outputParameter]);
        }
      }
      continue;
    }

    if (ast.node === "Model") {
      const model = ast as MncModelNode;
      for (const iface of model.interfaces) {
        addDefinition(definitions, file.path, ["interface"], iface);

        for (const command of iface.commands) {
          addDefinition(definitions, file.path, ["command", "interfaceItem"], command);
          addParameters(definitions, file.path, command.parameters);
        }
        for (const event of iface.events) {
          addDefinition(definitions, file.path, ["event", "interfaceItem", "outcomeItem"], event);
          addParameters(definitions, file.path, event.parameters);
        }
        for (const alarm of iface.alarms) {
          addDefinition(definitions, file.path, ["alarm", "interfaceItem", "outcomeItem"], alarm);
          addParameters(definitions, file.path, alarm.parameters);
        }
        for (const dataPoint of iface.dataPoints) {
          addDefinition(
            definitions,
            file.path,
            ["dataPoint", "interfaceItem", "outcomeItem"],
            dataPoint,
          );
          addParameters(definitions, file.path, dataPoint.parameters);
        }
        for (const response of iface.responses) {
          addDefinition(definitions, file.path, ["response", "outcomeItem"], response);
          addParameters(definitions, file.path, response.parameters);
        }
        for (const state of iface.operatingStates?.operatingStates ?? []) {
          addDefinition(definitions, file.path, ["operatingState"], state);
          addParameters(definitions, file.path, state.parameters);
        }
      }

      for (const controlNode of model.controlNodes) {
        addDefinition(definitions, file.path, ["controlNode"], controlNode);
      }
      continue;
    }

    if (ast.node === "CapabilityFile") {
      for (const capability of (ast as CapabilityFileNode).capabilities) {
        addDefinition(definitions, file.path, ["capability"], capability);
      }
      continue;
    }

    if (ast.node === "ActivityFile") {
      for (const diagram of (ast as ActivityFileNode).diagrams) {
        addDefinition(definitions, file.path, ["activityDiagram"], diagram);
        addParameters(definitions, file.path, diagram.results);
        for (const activity of diagram.activities) {
          addDefinition(definitions, file.path, ["activity"], activity);
        }
      }
    }
  }

  return definitions;
}

function collectReferences(workspace: Workspace): WorkspaceReferenceLocation[] {
  return workspace.files.flatMap((file) =>
    file.result.references.map((reference: Reference) => ({
      ...reference,
      path: file.path,
      declaration: false as const,
    })),
  );
}

export function buildWorkspaceLanguageIndex(workspace: Workspace): WorkspaceLanguageIndex {
  return {
    definitions: collectDefinitions(workspace),
    references: collectReferences(workspace),
  };
}

function locationContains(location: WorkspaceLanguageLocation, offset: number): boolean {
  return offset >= location.offset && offset < location.offset + Math.max(1, location.length);
}

function compatibleKinds(kind: RefKind): Set<RefKind> {
  return new Set(KIND_COMPATIBILITY[kind] ?? [kind]);
}

function uniqueLocations<T extends WorkspaceLanguageLocation>(locations: T[]): T[] {
  const seen = new Set<string>();
  return locations.filter((location) => {
    const key = `${location.path}:${location.offset}:${location.length}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sameSymbol(candidate: WorkspaceLanguageLocation, kind: RefKind, name: string): boolean {
  return (
    compatibleKinds(kind).has(candidate.kind) && simpleName(candidate.name) === simpleName(name)
  );
}

export function symbolAt(
  index: WorkspaceLanguageIndex,
  path: string,
  offset: number,
): WorkspaceLanguageLocation | null {
  const reference = index.references.find(
    (location) => location.path === path && locationContains(location, offset),
  );
  if (reference) return reference;

  return (
    index.definitions.find(
      (location) => location.path === path && locationContains(location, offset),
    ) ?? null
  );
}

export function findDefinitions(
  index: WorkspaceLanguageIndex,
  path: string,
  offset: number,
): WorkspaceDefinitionLocation[] {
  const symbol = symbolAt(index, path, offset);
  if (!symbol) return [];

  return uniqueLocations(
    index.definitions.filter((candidate) => sameSymbol(candidate, symbol.kind, symbol.name)),
  );
}

export function findReferences(
  index: WorkspaceLanguageIndex,
  path: string,
  offset: number,
  includeDeclaration = true,
): WorkspaceLanguageLocation[] {
  const symbol = symbolAt(index, path, offset);
  if (!symbol) return [];

  const references = index.references.filter((candidate) =>
    sameSymbol(candidate, symbol.kind, symbol.name),
  );

  if (!includeDeclaration) return uniqueLocations(references);

  return uniqueLocations([
    ...index.definitions.filter((candidate) => sameSymbol(candidate, symbol.kind, symbol.name)),
    ...references,
  ]);
}

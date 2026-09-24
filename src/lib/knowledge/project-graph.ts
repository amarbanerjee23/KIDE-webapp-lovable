import type {
  ActivityFileNode,
  CapabilityFileNode,
  DataPackageNode,
  MncModelNode,
  OperationDescriptionsNode,
  ParameterNode,
  Workspace,
} from "@/lib/dsl";
import {
  KIDE_ONTOLOGY_IRI,
  type KnowledgeDiagnostic,
  type KnowledgeEdge,
  type KnowledgeEdgeKind,
  type KnowledgeNode,
  type KnowledgeNodeKind,
  type KnowledgeProjection,
} from "@/lib/knowledge/contracts";
import { validateKnowledgeProjection } from "@/lib/knowledge/validation";

function segment(value: string): string {
  return encodeURIComponent(value.trim()).replace(/%2F/gi, "~");
}

function nodeId(
  projectId: string,
  kind: KnowledgeNodeKind,
  sourcePath: string,
  name: string,
): string {
  return `urn:kide:project:${segment(projectId)}:${kind.toLowerCase()}:${segment(sourcePath)}:${segment(name)}`;
}

function edgeId(kind: KnowledgeEdgeKind, from: string, to: string, suffix = ""): string {
  return `urn:kide:edge:${kind}:${segment(from)}:${segment(to)}:${segment(suffix)}`;
}

function parameterProperties(parameter: ParameterNode) {
  if (parameter.node === "SimpleType") {
    return { valueType: parameter.type };
  }
  if (parameter.node === "AbstractType") {
    return { typeRef: parameter.typeRef };
  }
  return {
    valueType: parameter.primitiveType ?? "",
    dataModelType: parameter.dataModelType ?? "",
  };
}

interface Builder {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  diagnostics: KnowledgeDiagnostic[];
  symbols: Map<string, string[]>;
  projectId: string;
}

function symbolKey(kind: KnowledgeNodeKind, name: string): string {
  return `${kind}:${name}`;
}

function addSymbol(builder: Builder, kind: KnowledgeNodeKind, name: string, id: string) {
  const key = symbolKey(kind, name);
  builder.symbols.set(key, [...(builder.symbols.get(key) ?? []), id]);
}

function addNode(
  builder: Builder,
  kind: KnowledgeNodeKind,
  label: string,
  sourcePath: string,
  properties: Record<string, string | number | boolean | string[]> = {},
): string {
  const id = nodeId(builder.projectId, kind, sourcePath, label);
  if (!builder.nodes.some((node) => node.id === id)) {
    builder.nodes.push({
      id,
      kind,
      label,
      scope: "project",
      projectId: builder.projectId,
      sourcePath,
      properties,
    });
    addSymbol(builder, kind, label, id);
  }
  return id;
}

function addEdge(
  builder: Builder,
  kind: KnowledgeEdgeKind,
  from: string,
  to: string,
  suffix = "",
  properties: Record<string, string | number | boolean | string[]> = {},
) {
  const id = edgeId(kind, from, to, suffix);
  if (builder.edges.some((edge) => edge.id === id)) return;
  builder.edges.push({
    id,
    kind,
    from,
    to,
    scope: "project",
    projectId: builder.projectId,
    properties,
  });
}

function resolve(
  builder: Builder,
  kind: KnowledgeNodeKind,
  name: string,
  sourcePath: string,
): string | null {
  const matches = builder.symbols.get(symbolKey(kind, name)) ?? [];
  if (matches.length === 1) return matches[0] ?? null;
  if (matches.length > 1) {
    builder.diagnostics.push({
      severity: "warning",
      code: "KG_AMBIGUOUS_REFERENCE",
      message: `Semantic reference '${name}' resolves to multiple ${kind} entities.`,
      sourcePath,
    });
  }
  return null;
}

function projectRoot(projectId: string): KnowledgeNode {
  return {
    id: `urn:kide:project:${segment(projectId)}`,
    kind: "Project",
    label: projectId,
    scope: "project",
    projectId,
    properties: {},
  };
}

function firstPass(builder: Builder, workspace: Workspace) {
  for (const file of workspace.files) {
    const ast = file.result.ast;
    if (!ast) continue;

    if (ast.node === "DataPackage") {
      for (const model of (ast as DataPackageNode).dataModels) {
        addNode(builder, "DataModel", model.name, file.path, {
          package: ast.name ?? "",
        });
        for (const parameter of model.primitives) {
          addNode(builder, "Parameter", parameter.name, file.path, parameterProperties(parameter));
        }
      }
    }

    if (ast.node === "OperationDescriptions") {
      for (const operation of (ast as OperationDescriptionsNode).operations) {
        addNode(builder, "Operation", operation.name, file.path, {
          executableScript: operation.executableScript ?? "",
        });
        for (const parameter of operation.inputParameters) {
          addNode(builder, "Parameter", parameter.name, file.path, parameterProperties(parameter));
        }
        if (operation.outputParameter) {
          addNode(
            builder,
            "Parameter",
            operation.outputParameter.name,
            file.path,
            parameterProperties(operation.outputParameter),
          );
        }
      }
    }

    if (ast.node === "Model") {
      const model = ast as MncModelNode;
      addNode(builder, "ControlModel", model.name, file.path, { imports: model.imports });
      for (const iface of model.interfaces) {
        addNode(builder, "Interface", iface.name, file.path, {
          ipaddress: iface.ipaddress ?? "",
          port: iface.port?.value ?? 0,
          uses: iface.uses,
        });
        for (const command of iface.commands) {
          addNode(builder, "Command", command.name, file.path, { asynchronous: command.asynch });
        }
        for (const event of iface.events) {
          addNode(builder, "Event", event.name, file.path, { publish: event.publish });
        }
        for (const alarm of iface.alarms) {
          addNode(builder, "Alarm", alarm.name, file.path, {
            publish: alarm.publish,
            level: alarm.level ?? 0,
          });
        }
        for (const dataPoint of iface.dataPoints) {
          addNode(builder, "DataPoint", dataPoint.name, file.path, {
            publish: dataPoint.publish,
            valueType: dataPoint.type ?? "",
          });
        }
        for (const response of iface.responses) {
          addNode(builder, "Response", response.name, file.path);
        }
        for (const state of iface.operatingStates?.operatingStates ?? []) {
          addNode(builder, "OperatingState", state.name, file.path);
        }
      }
      for (const controlNode of model.controlNodes) {
        addNode(builder, "ControlNode", controlNode.name, file.path);
      }
    }

    if (ast.node === "CapabilityFile") {
      for (const capability of (ast as CapabilityFileNode).capabilities) {
        addNode(builder, "Capability", capability.name, file.path);
        addNode(builder, "Behavior", `${capability.name}:behavior`, file.path, {
          commands: capability.providesControlCapabilities?.commands ?? [],
          events: capability.providesControlCapabilities?.events ?? [],
          alarms: capability.providesControlCapabilities?.alarms ?? [],
          dataPoints: capability.providesControlCapabilities?.dataPoints ?? [],
        });
        if (capability.requiredInitProcess) {
          addNode(builder, "Precondition", `${capability.name}:initialization`, file.path, {
            source: "requiredInitProcess",
          });
        }
        if (capability.providesOutcomes) {
          addNode(builder, "Postcondition", `${capability.name}:outcomes`, file.path, {
            responses: capability.providesOutcomes.responses,
            events: capability.providesOutcomes.events,
            alarms: capability.providesOutcomes.alarms,
            dataPoints: capability.providesOutcomes.dataPoints,
          });
        }
      }
    }

    if (ast.node === "ActivityFile") {
      for (const diagram of (ast as ActivityFileNode).diagrams) {
        addNode(builder, "Workflow", diagram.name, file.path, {
          physicalContext: diagram.physicalContext,
          dataObjects: diagram.dataObjects,
        });
        for (const activity of diagram.activities) {
          addNode(builder, "Activity", activity.name, file.path, {
            description: activity.description ?? "",
            time: activity.time ?? 0,
            unit: activity.unit ?? "",
          });
          if (diagram.physicalContext.length > 0 || diagram.contextDataModel.length > 0) {
            addNode(builder, "Context", `${diagram.name}:${activity.name}:context`, file.path, {
              physicalContext: diagram.physicalContext,
              contextDataModel: diagram.contextDataModel,
            });
          }
        }
      }
    }
  }
}

function secondPass(builder: Builder, workspace: Workspace, projectId: string) {
  const root = `urn:kide:project:${segment(projectId)}`;

  for (const file of workspace.files) {
    const ast = file.result.ast;
    if (!ast) continue;

    if (ast.node === "DataPackage") {
      for (const model of (ast as DataPackageNode).dataModels) {
        const modelId = resolve(builder, "DataModel", model.name, file.path);
        if (!modelId) continue;
        addEdge(builder, "containsDataModel", root, modelId);
        for (const parameter of model.primitives) {
          const parameterId = resolve(builder, "Parameter", parameter.name, file.path);
          if (parameterId) addEdge(builder, "hasParameter", modelId, parameterId, model.name);
        }
      }
    }

    if (ast.node === "OperationDescriptions") {
      for (const operation of (ast as OperationDescriptionsNode).operations) {
        const operationId = resolve(builder, "Operation", operation.name, file.path);
        if (!operationId) continue;
        addEdge(builder, "containsOperation", root, operationId);
        for (const parameter of operation.inputParameters) {
          const parameterId = resolve(builder, "Parameter", parameter.name, file.path);
          if (parameterId) addEdge(builder, "hasParameter", operationId, parameterId, "input");
        }
        if (operation.outputParameter) {
          const parameterId = resolve(
            builder,
            "Parameter",
            operation.outputParameter.name,
            file.path,
          );
          if (parameterId) addEdge(builder, "hasParameter", operationId, parameterId, "output");
        }
      }
    }

    if (ast.node === "Model") {
      const model = ast as MncModelNode;
      const modelId = resolve(builder, "ControlModel", model.name, file.path);
      if (!modelId) continue;
      addEdge(builder, "containsControlModel", root, modelId);

      for (const iface of model.interfaces) {
        const ifaceId = resolve(builder, "Interface", iface.name, file.path);
        if (!ifaceId) continue;
        addEdge(builder, "hasInterface", modelId, ifaceId);

        for (const [kind, entries, relation] of [
          ["Command", iface.commands, "exposesCommand"],
          ["Event", iface.events, "emitsEvent"],
          ["Alarm", iface.alarms, "raisesAlarm"],
          ["DataPoint", iface.dataPoints, "exposesDataPoint"],
          ["Response", iface.responses, "returnsResponse"],
          ["OperatingState", iface.operatingStates?.operatingStates ?? [], "hasOperatingState"],
        ] as const) {
          for (const entry of entries) {
            const itemId = resolve(builder, kind, entry.name, file.path);
            if (itemId) addEdge(builder, relation, ifaceId, itemId, iface.name);
          }
        }
      }

      for (const controlNode of model.controlNodes) {
        const controlId = resolve(builder, "ControlNode", controlNode.name, file.path);
        const ifaceId = resolve(builder, "Interface", controlNode.interfaceDescription, file.path);
        if (controlId) addEdge(builder, "hasControlNode", modelId, controlId);
        if (controlId && ifaceId) addEdge(builder, "bindsInterface", controlId, ifaceId);
      }
    }

    if (ast.node === "CapabilityFile") {
      for (const capability of (ast as CapabilityFileNode).capabilities) {
        const capabilityId = resolve(builder, "Capability", capability.name, file.path);
        const behaviorId = resolve(builder, "Behavior", `${capability.name}:behavior`, file.path);
        if (!capabilityId) continue;

        addEdge(builder, "containsCapability", root, capabilityId);
        if (behaviorId) addEdge(builder, "hasBehavior", capabilityId, behaviorId);

        for (const interfaceName of capability.componentInterface) {
          const ifaceId = resolve(builder, "Interface", interfaceName, file.path);
          if (ifaceId) addEdge(builder, "hasInterface", capabilityId, ifaceId, interfaceName);
        }

        const controls = capability.providesControlCapabilities;
        if (behaviorId && controls) {
          for (const [kind, names] of [
            ["Command", controls.commands],
            ["Event", controls.events],
            ["Alarm", controls.alarms],
            ["DataPoint", controls.dataPoints],
          ] as const) {
            for (const name of names) {
              const itemId = resolve(builder, kind, name, file.path);
              if (itemId) addEdge(builder, "realizesInterfaceItem", behaviorId, itemId, name);
            }
          }
        }

        const preconditionId = resolve(
          builder,
          "Precondition",
          `${capability.name}:initialization`,
          file.path,
        );
        if (preconditionId) addEdge(builder, "hasPrecondition", capabilityId, preconditionId);

        const postconditionId = resolve(
          builder,
          "Postcondition",
          `${capability.name}:outcomes`,
          file.path,
        );
        if (postconditionId) addEdge(builder, "hasPostcondition", capabilityId, postconditionId);
      }
    }

    if (ast.node === "ActivityFile") {
      for (const diagram of (ast as ActivityFileNode).diagrams) {
        const workflowId = resolve(builder, "Workflow", diagram.name, file.path);
        if (!workflowId) continue;
        addEdge(builder, "containsWorkflow", root, workflowId);

        for (const modelName of diagram.contextDataModel) {
          const dataModelId = resolve(builder, "DataModel", modelName, file.path);
          if (dataModelId) addEdge(builder, "usesDataModel", workflowId, dataModelId, modelName);
        }

        for (const activity of diagram.activities) {
          const activityId = resolve(builder, "Activity", activity.name, file.path);
          if (!activityId) continue;
          addEdge(builder, "hasActivities", workflowId, activityId);

          const capabilityName = activity.bindCapability ?? activity.requiredCapability;
          if (capabilityName) {
            const capabilityId = resolve(builder, "Capability", capabilityName, file.path);
            if (capabilityId) {
              addEdge(builder, "requiredCapability", activityId, capabilityId);
              const contextId = resolve(
                builder,
                "Context",
                `${diagram.name}:${activity.name}:context`,
                file.path,
              );
              if (contextId) addEdge(builder, "hasContext", capabilityId, contextId, activity.name);
            }
          }

          for (const operationName of activity.requiresOperation) {
            const operationId = resolve(builder, "Operation", operationName, file.path);
            if (operationId) addEdge(builder, "requiresOperation", activityId, operationId);
          }

          if (activity.nextActivity) {
            const targetId = resolve(builder, "Activity", activity.nextActivity, file.path);
            if (targetId) addEdge(builder, "nextActivity", activityId, targetId);
          }
        }
      }
    }
  }
}

export function projectWorkspaceToKnowledgeGraph(
  projectId: string,
  workspace: Workspace,
  generatedAt = new Date().toISOString(),
): KnowledgeProjection {
  const builder: Builder = {
    nodes: [projectRoot(projectId)],
    edges: [],
    diagnostics: [],
    symbols: new Map(),
    projectId,
  };

  addSymbol(builder, "Project", projectId, builder.nodes[0]!.id);
  firstPass(builder, workspace);
  secondPass(builder, workspace, projectId);

  const projection: KnowledgeProjection = {
    schemaVersion: 1,
    ontologyIri: KIDE_ONTOLOGY_IRI,
    scope: "project",
    projectId,
    generatedAt,
    nodes: [...builder.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...builder.edges].sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: [...builder.diagnostics],
  };

  projection.diagnostics.push(...validateKnowledgeProjection(projection));
  projection.diagnostics.sort((a, b) =>
    `${a.severity}:${a.code}:${a.entityId ?? ""}`.localeCompare(
      `${b.severity}:${b.code}:${b.entityId ?? ""}`,
    ),
  );
  return projection;
}

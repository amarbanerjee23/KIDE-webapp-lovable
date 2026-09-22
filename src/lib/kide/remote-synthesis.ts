import type {
  ActionNode,
  ActivityDiagramNode,
  ActivityFileNode,
  ActivityNode,
  CapabilityFileNode,
  CapabilityNode,
  InterfaceDescriptionNode,
  MncModelNode,
  TransitionNode,
  Workspace,
} from "@/lib/dsl";
import type {
  RemoteCapabilityMachine,
  RemoteMachineTransition,
  RemoteSynthesisRequest,
} from "@/lib/kide/synthesis-client";

const DEFAULT_CAPABILITY_NAMESPACE = "http://iiit.serc.com/ontologies/capability.owl#";

export interface RemoteRequestBuild {
  request: RemoteSynthesisRequest | null;
  issues: string[];
}

function firstDiagram(workspace: Workspace): ActivityDiagramNode | null {
  for (const file of workspace.files) {
    if (file.result.ast?.node === "ActivityFile") {
      return (file.result.ast as ActivityFileNode).diagrams[0] ?? null;
    }
  }
  return null;
}

function capabilityMap(workspace: Workspace): Map<string, CapabilityNode> {
  const result = new Map<string, CapabilityNode>();
  for (const file of workspace.files) {
    if (file.result.ast?.node !== "CapabilityFile") continue;
    for (const capability of (file.result.ast as CapabilityFileNode).capabilities) {
      result.set(capability.name, capability);
    }
  }
  return result;
}

function interfaceMap(workspace: Workspace): Map<string, InterfaceDescriptionNode> {
  const result = new Map<string, InterfaceDescriptionNode>();
  for (const file of workspace.files) {
    if (file.result.ast?.node !== "Model") continue;
    for (const item of (file.result.ast as MncModelNode).interfaces) {
      result.set(item.name, item);
    }
  }
  return result;
}

function models(workspace: Workspace): MncModelNode[] {
  return workspace.files.flatMap((file) =>
    file.result.ast?.node === "Model" ? [file.result.ast as MncModelNode] : [],
  );
}

function capabilityName(activity: ActivityNode): string | null {
  return activity.requiredCapability ?? activity.bindCapability ?? null;
}

function refName(value: string): string {
  return value.split(".").at(-1) ?? value;
}

function capabilityUri(name: string): string {
  const namespace =
    import.meta.env["VITE_KIDE_CAPABILITY_NAMESPACE"]?.trim() ||
    DEFAULT_CAPABILITY_NAMESPACE;
  return `${namespace}${encodeURIComponent(name)}`;
}

function transitionsFromAction(
  action: ActionNode | undefined,
  stateNames: string[],
  event: string,
): RemoteMachineTransition[] {
  if (!action) return [];
  const known = new Set(stateNames);
  return action.transitionStates.flatMap((transition) =>
    remoteTransitions(transition, known, stateNames, event),
  );
}

function remoteTransitions(
  transition: TransitionNode,
  known: Set<string>,
  stateNames: string[],
  event: string,
): RemoteMachineTransition[] {
  const target = refName(transition.nextState);
  if (!known.has(target)) return [];

  const sources = transition.any
    ? stateNames
    : transition.currentState.map(refName).filter((state) => known.has(state));

  return sources.map((source) => ({
    source,
    target,
    event,
  }));
}

function machineForCapability(
  capability: CapabilityNode,
  iface: InterfaceDescriptionNode,
  workspaceModels: MncModelNode[],
): RemoteCapabilityMachine | null {
  const operating = iface.operatingStates;
  if (
    !operating ||
    operating.operatingStates.length === 0 ||
    operating.startStates.length === 0 ||
    operating.endStates.length === 0
  ) {
    return null;
  }

  const states = operating.operatingStates.map((state) => state.name);
  const known = new Set(states);
  const startStates = operating.startStates.map(refName).filter((state) => known.has(state));
  const endStates = operating.endStates.map(refName).filter((state) => known.has(state));

  if (startStates.length === 0 || endStates.length === 0) return null;

  const transitions: RemoteMachineTransition[] = [
    ...transitionsFromAction(capability.requiredInitProcess, states, "capability:init"),
  ];

  const commands = new Set(
    capability.providesControlCapabilities?.commands.map(refName) ?? [],
  );

  for (const model of workspaceModels) {
    for (const node of model.controlNodes) {
      if (refName(node.interfaceDescription) !== iface.name) continue;
      for (const block of node.commandResponseBlocks) {
        const command = refName(block.command);
        if (!commands.has(command)) continue;
        transitions.push(
          ...transitionsFromAction(block.action, states, `command:${command}`),
        );
      }
    }
  }

  const unique = new Map<string, RemoteMachineTransition>();
  for (const transition of transitions) {
    const key = `${transition.source}\u0000${transition.target}\u0000${transition.event ?? ""}`;
    unique.set(key, transition);
  }

  return {
    capabilityUri: capabilityUri(capability.name),
    states,
    startStates,
    endStates,
    transitions: [...unique.values()].sort(
      (left, right) =>
        left.source.localeCompare(right.source) ||
        left.target.localeCompare(right.target) ||
        (left.event ?? "").localeCompare(right.event ?? ""),
    ),
  };
}

function outgoing(activity: ActivityNode): string[] {
  return [
    activity.nextActivity,
    ...activity.conditionalActivity.map((condition) => condition.onTrueNextActivity),
  ]
    .filter((value): value is string => Boolean(value))
    .map(refName);
}

function nextCapabilities(
  starting: string[],
  byName: Map<string, ActivityNode>,
  backed: Set<string>,
): Set<string> {
  const found = new Set<string>();
  const queue = [...starting];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const name = queue.shift();
    if (!name || visited.has(name)) continue;
    visited.add(name);

    if (backed.has(name)) {
      found.add(name);
      continue;
    }

    const activity = byName.get(name);
    if (activity) queue.push(...outgoing(activity));
  }

  return found;
}

function linearCapabilityOrder(diagram: ActivityDiagramNode): {
  order: string[];
  issue: string | null;
} {
  const byName = new Map(
    diagram.activities.map((activity) => [activity.name, activity]),
  );
  const backed = new Set(
    diagram.activities
      .filter((activity) => capabilityName(activity))
      .map((activity) => activity.name),
  );

  if (backed.size === 0) {
    return {
      order: [],
      issue: "The workflow contains no capability-backed activities.",
    };
  }

  const first = diagram.activities[0];
  if (!first) {
    return { order: [], issue: "The workflow contains no activities." };
  }

  const firstCandidates = nextCapabilities([first.name], byName, backed);
  if (firstCandidates.size !== 1) {
    return {
      order: [],
      issue:
        "Remote synthesis currently requires one linear capability path; the workflow has multiple capability entry paths.",
    };
  }

  const order: string[] = [];
  const visited = new Set<string>();
  let current = [...firstCandidates][0] as string;

  while (true) {
    if (visited.has(current)) {
      return {
        order: [],
        issue: "Remote synthesis does not accept cyclic capability workflows.",
      };
    }

    visited.add(current);
    order.push(current);
    const activity = byName.get(current);
    if (!activity) break;

    if (
      activity.interruptedBy.length > 0 ||
      activity.interrupts.length > 0 ||
      activity.nextActivityDiagram
    ) {
      return {
        order: [],
        issue:
          "Remote synthesis currently requires a linear workflow without interruption or child-diagram edges.",
      };
    }

    const candidates = nextCapabilities(outgoing(activity), byName, backed);
    if (candidates.size === 0) break;
    if (candidates.size > 1) {
      return {
        order: [],
        issue:
          "Remote synthesis currently requires one linear capability path; a capability activity branches to multiple capability successors.",
      };
    }
    current = [...candidates][0] as string;
  }

  if (order.length !== backed.size) {
    return {
      order: [],
      issue:
        "Remote synthesis requires every capability-backed activity to be reachable on one linear path.",
    };
  }

  return { order, issue: null };
}

export function buildRemoteSynthesisRequest(workspace: Workspace): RemoteRequestBuild {
  const issues: string[] = [];
  if (workspace.errorCount > 0) {
    issues.push("Workspace errors must be resolved before remote synthesis.");
  }

  const diagram = firstDiagram(workspace);
  if (!diagram) {
    return {
      request: null,
      issues: [...issues, "No activity workflow is available."],
    };
  }

  const capabilities = capabilityMap(workspace);
  const interfaces = interfaceMap(workspace);
  const workspaceModels = models(workspace);
  const order = linearCapabilityOrder(diagram);
  if (order.issue) issues.push(order.issue);

  const byActivity = new Map(
    diagram.activities.map((activity) => [activity.name, activity]),
  );
  const remoteActivities = [];
  const machines = new Map<string, RemoteCapabilityMachine>();

  for (const activityName of order.order) {
    const activity = byActivity.get(activityName);
    const wanted = activity ? capabilityName(activity) : null;
    const capability = wanted ? capabilities.get(wanted) : undefined;
    if (!activity || !wanted || !capability) {
      issues.push(
        `${activityName}: required capability '${wanted ?? "unknown"}' does not resolve.`,
      );
      continue;
    }

    const interfaceName = capability.componentInterface[0]
      ? refName(capability.componentInterface[0])
      : null;
    const iface = interfaceName ? interfaces.get(interfaceName) : undefined;
    if (!iface) {
      issues.push(
        `${activityName}: capability '${capability.name}' has no resolvable component interface.`,
      );
      continue;
    }

    const uri = capabilityUri(capability.name);
    const machine = machineForCapability(capability, iface, workspaceModels);
    if (!machine) {
      issues.push(
        `${activityName}: interface '${iface.name}' must declare operating states, start states, and end states for remote synthesis.`,
      );
      continue;
    }

    remoteActivities.push({ name: activityName, capabilityUri: uri });
    machines.set(uri, machine);
  }

  if (issues.length > 0 || remoteActivities.length === 0) {
    return { request: null, issues };
  }

  const executionPlan =
    remoteActivities.length > 1
      ? [
          {
            kind: "sequential" as const,
            activities: remoteActivities.map((activity) => activity.name),
          },
        ]
      : [];

  return {
    request: {
      projectId: diagram.name,
      activities: remoteActivities,
      capabilityMachines: [...machines.values()].sort((left, right) =>
        left.capabilityUri.localeCompare(right.capabilityUri),
      ),
      executionPlan,
    },
    issues: [],
  };
}

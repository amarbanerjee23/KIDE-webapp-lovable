import type { ActivityDiagramNode, ActivityNode } from "@/lib/dsl/ast";

export interface GraphNode {
  id: string;
  performer: string;
  performerKind: "capability" | "operation" | "diagram" | "unbound";
  description: string;
  duration: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: "normal" | "conditional" | "failure" | "final";
}

export interface ActivityGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  finals: Array<{ id: string; from: string; label: string }>;
}

export const NODE_WIDTH = 210;
export const NODE_HEIGHT = 78;
const COLUMN_GAP = 110;
const ROW_GAP = 48;

/** Words that mark a branch as a failure or degraded path. */
const FAILURE_HINTS = ["alarm", "fail", "error", "reject", "abort", "low", "fault", "degrad", "timeout"];

export function isFailureOutcome(label: string): boolean {
  const lowered = label.toLowerCase();
  return FAILURE_HINTS.some((hint) => lowered.includes(hint));
}

function performerOf(activity: ActivityNode): Pick<GraphNode, "performer" | "performerKind"> {
  if (activity.bindCapability) return { performer: activity.bindCapability, performerKind: "capability" };
  if (activity.requiredCapability) return { performer: activity.requiredCapability, performerKind: "capability" };
  if (activity.requiresOperation.length > 0)
    return { performer: activity.requiresOperation.join(", "), performerKind: "operation" };
  if (activity.childActivityDiagram)
    return { performer: activity.childActivityDiagram, performerKind: "diagram" };
  return { performer: "not assigned", performerKind: "unbound" };
}

function outcomeLabel(condition: ActivityDiagramNode["activities"][number]["conditionalActivity"][number]): string {
  const parts: string[] = [];
  for (const outcome of condition.outcomes) {
    if (outcome.capabilityOutcome) parts.push(outcome.capabilityOutcome);
    for (const validation of outcome.validations) parts.push(validation.parameter);
  }
  return parts.join(" & ") || "condition";
}

/** Derive the drawable graph, applying saved positions and auto-layout. */
export function buildGraph(
  diagram: ActivityDiagramNode,
  positions: Record<string, { x: number; y: number }> = {},
): ActivityGraph {
  const laid = autoLayout(diagram);
  const nodes: GraphNode[] = diagram.activities.map((activity) => {
    const saved = positions[activity.name] ?? laid[activity.name] ?? { x: 40, y: 40 };
    return {
      id: activity.name,
      description: activity.description ?? "",
      duration: activity.time !== undefined && activity.unit ? `${activity.time} ${activity.unit}` : "",
      x: saved.x,
      y: saved.y,
      ...performerOf(activity),
    };
  });

  const edges: GraphEdge[] = [];
  const finals: ActivityGraph["finals"] = [];

  for (const activity of diagram.activities) {
    if (activity.nextActivity) {
      edges.push({
        id: `${activity.name}->${activity.nextActivity}`,
        from: activity.name,
        to: activity.nextActivity,
        label: "",
        kind: "normal",
      });
    }
    activity.conditionalActivity.forEach((condition, index) => {
      const label = outcomeLabel(condition);
      if (condition.onTrueNextActivity) {
        edges.push({
          id: `${activity.name}-c${index}->${condition.onTrueNextActivity}`,
          from: activity.name,
          to: condition.onTrueNextActivity,
          label,
          kind: isFailureOutcome(label) ? "failure" : "conditional",
        });
      } else if (condition.onTrueFinalResult) {
        finals.push({
          id: `${activity.name}-final${index}`,
          from: activity.name,
          label: `${label} → ${condition.onTrueFinalResult}`,
        });
      }
    });
  }

  return { nodes, edges, finals };
}

/** Deterministic layered layout: depth from the first activity, then order. */
export function autoLayout(diagram: ActivityDiagramNode): Record<string, { x: number; y: number }> {
  const order = diagram.activities.map((activity) => activity.name);
  const depth = new Map<string, number>();
  const first = order[0];
  if (first) {
    const queue: Array<[string, number]> = [[first, 0]];
    while (queue.length > 0) {
      const [name, level] = queue.shift()!;
      if (depth.has(name) && depth.get(name)! <= level) continue;
      depth.set(name, level);
      const activity = diagram.activities.find((item) => item.name === name);
      if (!activity) continue;
      const next = [
        activity.nextActivity,
        ...activity.conditionalActivity.map((condition) => condition.onTrueNextActivity),
      ].filter((value): value is string => Boolean(value));
      for (const target of next) if (order.includes(target)) queue.push([target, level + 1]);
    }
  }

  let orphanLevel = 0;
  for (const name of order) {
    if (!depth.has(name)) depth.set(name, ++orphanLevel);
  }

  const perLevel = new Map<number, number>();
  const positions: Record<string, { x: number; y: number }> = {};
  for (const name of order) {
    const level = depth.get(name) ?? 0;
    const row = perLevel.get(level) ?? 0;
    perLevel.set(level, row + 1);
    positions[name] = {
      x: 40 + level * (NODE_WIDTH + COLUMN_GAP),
      y: 40 + row * (NODE_HEIGHT + ROW_GAP),
    };
  }
  return positions;
}

/* ------------------------------------------------------------------ */
/* Edit operations — pure functions over the diagram node               */
/* ------------------------------------------------------------------ */

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function addActivity(
  diagram: ActivityDiagramNode,
  name: string,
  performer: { kind: "capability" | "operation"; ref: string; controls?: string[] },
): ActivityDiagramNode {
  const next = clone(diagram);
  const activity: ActivityNode = {
    node: "Activity",
    name,
    line: 0,
    column: 0,
    offset: 0,
    length: name.length,
    inputParameters: [],
    useControlCapabilities: performer.controls ?? [],
    requiresOperation: performer.kind === "operation" ? [performer.ref] : [],
    conditionalActivity: [],
    interruptedBy: [],
    interrupts: [],
  } as ActivityNode;
  if (performer.kind === "capability") activity.bindCapability = performer.ref;
  next.activities.push(activity);
  return next;
}

export function removeActivity(diagram: ActivityDiagramNode, name: string): ActivityDiagramNode {
  const next = clone(diagram);
  next.activities = next.activities.filter((activity) => activity.name !== name);
  for (const activity of next.activities) {
    if (activity.nextActivity === name) delete activity.nextActivity;
    activity.conditionalActivity = activity.conditionalActivity.filter(
      (condition) => condition.onTrueNextActivity !== name,
    );
    activity.interruptedBy = activity.interruptedBy.filter((item) => item !== name);
    activity.interrupts = activity.interrupts.filter((item) => item !== name);
  }
  return next;
}

export function renameActivity(
  diagram: ActivityDiagramNode,
  from: string,
  to: string,
): ActivityDiagramNode {
  const next = clone(diagram);
  for (const activity of next.activities) {
    if (activity.name === from) activity.name = to;
    if (activity.nextActivity === from) activity.nextActivity = to;
    for (const condition of activity.conditionalActivity) {
      if (condition.onTrueNextActivity === from) condition.onTrueNextActivity = to;
    }
    activity.interruptedBy = activity.interruptedBy.map((item) => (item === from ? to : item));
    activity.interrupts = activity.interrupts.map((item) => (item === from ? to : item));
  }
  return next;
}

/** Connect two steps. An outcome makes it a conditional (or failure) branch. */
export function connect(
  diagram: ActivityDiagramNode,
  from: string,
  to: string,
  outcome?: string,
): ActivityDiagramNode {
  const next = clone(diagram);
  const source = next.activities.find((activity) => activity.name === from);
  if (!source || from === to) return diagram;

  if (outcome) {
    source.conditionalActivity.push({
      node: "ConditionalActivity",
      outcomes: [{ node: "Outcome", capabilityOutcome: outcome, validations: [] }],
      operators: [],
      onTrueNextActivity: to,
    });
    delete source.nextActivity;
  } else if (source.conditionalActivity.length > 0) {
    source.conditionalActivity.push({
      node: "ConditionalActivity",
      outcomes: [{ node: "Outcome", capabilityOutcome: "Completed", validations: [] }],
      operators: [],
      onTrueNextActivity: to,
    });
  } else {
    source.nextActivity = to;
    delete source.nextActivityDiagram;
  }
  return next;
}

export function disconnect(diagram: ActivityDiagramNode, edgeId: string): ActivityDiagramNode {
  const next = clone(diagram);
  for (const activity of next.activities) {
    if (activity.nextActivity && `${activity.name}->${activity.nextActivity}` === edgeId) {
      delete activity.nextActivity;
    }
    activity.conditionalActivity = activity.conditionalActivity.filter(
      (condition, index) =>
        `${activity.name}-c${index}->${condition.onTrueNextActivity}` !== edgeId,
    );
  }
  return next;
}

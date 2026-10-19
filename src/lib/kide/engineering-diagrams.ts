/* eslint-disable prettier/prettier -- Stable diagram layout coordinates and ZIP field offsets are intentionally explicit. */
import type { LinkedFile, Workspace, ActivityNode, ActionNode, ParameterNode } from "@/lib/dsl";
import { exportModelSet } from "@/lib/kide/model-exchange";
import { sha256 } from "@/lib/kide/sha256";

type NodeKind = "root" | "data" | "operation" | "device" | "capability" | "activity" | "signal";
type GraphNode = { id: string; label: string; description: string; lane: 0 | 1 | 2; kind: NodeKind };
type GraphEdge = { from: string; to: string; label: string };
type Graph = { title: string; subtitle: string; nodes: GraphNode[]; edges: GraphEdge[] };

export type DiagramExportContext = {
  projectId: string;
  organizationId: string;
  saveStatus: string;
  exportedAt?: string;
};

export type DiagramBundle = {
  filename: string;
  bytes: Uint8Array;
  manifest: DiagramManifest;
};

export type DiagramManifest = {
  format: "kide.engineering-diagrams/1";
  projectId: string;
  organizationId: string;
  exportedAt: string;
  saveStatus: string;
  status: "snapshot-not-release-approved";
  note: string;
  diagrams: Array<{ file: string; title: string; sourceModel: string | null; nodeCount: number; edgeCount: number }>;
  sources: Array<{ path: string; sha256: string; kind: string }>;
  modelSet: string;
};

function graph(title: string, subtitle: string) {
  const value: Graph = { title, subtitle, nodes: [], edges: [] };
  const add = (label: string, kind: NodeKind, lane: 0 | 1 | 2, description = "") => {
    const id = `n${value.nodes.length}`;
    value.nodes.push({ id, label, kind, lane, description });
    return id;
  };
  const edge = (from: string, to: string, label: string) => {
    value.edges.push({ from, to, label });
  };
  return { value, add, edge };
}

function parameterLabel(parameter: ParameterNode): string {
  switch (parameter.node) {
    case "SimpleType": return `${parameter.name}: ${parameter.type}`;
    case "AbstractType": return `${parameter.name}: ${parameter.typeRef}`;
    case "ArrayType": return `${parameter.name}: ${parameter.primitiveType ?? parameter.dataModelType ?? "array"}[]`;
  }
}

function actionReferences(action?: ActionNode): string[] {
  if (!action) return [];
  return [
    ...action.raiseAlarm.map((item) => `alarm: ${item.ref}`),
    ...action.fireCommand.map((item) => `command: ${item.ref}`),
    ...action.publishEvent.map((item) => `event: ${item.ref}`),
    ...action.triggerDataPoint.map((item) => `data point: ${item.ref}`),
    ...action.executeOperation.map((item) => `operation: ${item.ref}`),
    ...action.transitionStates.map((item) =>
      `state: ${item.currentState.join(", ") || "any"} → ${item.nextState}`),
  ];
}

/** The parsed AST, never a hand-built example, is the single diagram source of truth. */
export function graphForFile(file: LinkedFile): Graph {
  const { value, add, edge } = graph(file.path, `KIDE ${file.kind.toUpperCase()} · model-derived engineering diagram`);
  const ast = file.result.ast;
  if (!ast) throw new Error(`Cannot diagram unparseable model "${file.path}".`);

  if (ast.node === "DataPackage") {
    for (const model of ast.dataModels) {
      const parent = add(`Data model: ${model.name}`, "data", 0, ast.name ?? "Data package");
      for (const param of model.primitives) {
        edge(parent, add(parameterLabel(param), "signal", 1), "field");
      }
      for (const composite of model.composites) {
        edge(parent, add(`Model: ${composite}`, "data", 1), "composes");
      }
    }
  } else if (ast.node === "OperationDescriptions") {
    for (const operation of ast.operations) {
      const parent = add(`Operation: ${operation.name}`, "operation", 0);
      for (const param of operation.inputParameters) {
        edge(add(parameterLabel(param), "signal", 1), parent, "input");
      }
      if (operation.outputParameter) {
        edge(parent, add(parameterLabel(operation.outputParameter), "signal", 1), "result");
      }
      if (operation.executableScript) {
        edge(parent, add(`Script: ${operation.executableScript}`, "signal", 2), "executes");
      }
    }
  } else if (ast.node === "Model") {
    const interfaces = new Map<string, string>();
    const nodes = new Map<string, string>();
    for (const item of ast.interfaces) {
      interfaces.set(item.name, add(`Interface: ${item.name}`, "device", 1));
    }
    for (const control of ast.controlNodes) {
      nodes.set(control.name, add(`Control node: ${control.name}`, "root", 0));
    }
    for (const control of ast.controlNodes) {
      const parent = nodes.get(control.name)!;
      const iface = interfaces.get(control.interfaceDescription);
      if (iface) edge(parent, iface, "implements");
      else edge(parent, add(`Interface: ${control.interfaceDescription}`, "device", 1), "implements");
      for (const child of control.childNodes) {
        edge(parent, nodes.get(child) ?? add(`Child: ${child}`, "device", 1), "child");
      }
      for (const block of control.commandResponseBlocks) {
        edge(parent, add(`Handles command: ${block.command}`, "signal", 2), "command handler");
        for (const ref of actionReferences(block.action)) {
          edge(parent, add(ref, "signal", 2), "action");
        }
      }
      for (const [kind, handlers] of [
        ["event", control.eventBlocks],
        ["alarm", control.alarmBlocks],
        ["data point", control.dataPointBlocks],
      ] as const) {
        for (const block of handlers) {
          for (const ref of block.refs) {
            edge(parent, add(`${kind}: ${ref}`, "signal", 2), "handles");
          }
          for (const ref of actionReferences(block.action)) {
            edge(parent, add(ref, "signal", 2), "action");
          }
        }
      }
    }
    for (const iface of ast.interfaces) {
      const parent = interfaces.get(iface.name)!;
      for (const [kind, items] of [
        ["command", iface.commands],
        ["event", iface.events],
        ["alarm", iface.alarms],
        ["response", iface.responses],
        ["data point", iface.dataPoints],
      ] as const) {
        for (const item of items) {
          edge(parent, add(`${kind}: ${item.name}`, "signal", 2), kind);
        }
      }
      for (const state of iface.operatingStates?.operatingStates ?? []) {
        edge(parent, add(`State: ${state.name}`, "signal", 2), "operating state");
      }
    }
  } else if (ast.node === "CapabilityFile") {
    for (const cap of ast.capabilities) {
      const parent = add(`Capability: ${cap.name}`, "capability", 0);
      for (const iface of cap.componentInterface) {
        edge(parent, add(`Interface: ${iface}`, "device", 1), "compatible");
      }
      for (const [kind, refs] of [
        ["command", cap.providesControlCapabilities?.commands ?? []],
        ["event", cap.providesControlCapabilities?.events ?? []],
        ["alarm", cap.providesControlCapabilities?.alarms ?? []],
        ["data point", cap.providesControlCapabilities?.dataPoints ?? []],
        ["response", cap.providesOutcomes?.responses ?? []],
        ["outcome event", cap.providesOutcomes?.events ?? []],
        ["outcome alarm", cap.providesOutcomes?.alarms ?? []],
        ["outcome data point", cap.providesOutcomes?.dataPoints ?? []],
        ["initialization action", actionReferences(cap.requiredInitProcess)],
      ] as const) {
        for (const ref of refs) {
          edge(parent, add(`${kind}: ${ref}`, "signal", 2), kind);
        }
      }
    }
  } else if (ast.node === "ActivityFile") {
    for (const diagram of ast.diagrams) {
      const root = add(`Workflow: ${diagram.name}`, "root", 0);
      const acts = new Map<string, string>();
      for (const activity of diagram.activities) {
        acts.set(activity.name, add(`Activity: ${activity.name}`, "activity", 1, activity.description ?? ""));
      }
      const refer = (from: string, value: string, relation: string) =>
        edge(from, add(value, "signal", 2), relation);
      for (const activity of diagram.activities) {
        const current = acts.get(activity.name)!;
        edge(root, current, "contains");
        if (activity.bindCapability || activity.requiredCapability) {
          refer(current, `Capability: ${activity.bindCapability ?? activity.requiredCapability}`, "requires");
        }
        for (const op of activity.requiresOperation) refer(current, `Operation: ${op}`, "requires");
        for (const ref of activity.useControlCapabilities) refer(current, `Interface item: ${ref}`, "uses");
        if (activity.childActivityDiagram) refer(current, `Workflow: ${activity.childActivityDiagram}`, "child workflow");
        if (activity.nextActivityDiagram) refer(current, `Workflow: ${activity.nextActivityDiagram}`, "next workflow");
        const next = activity.nextActivity ? acts.get(activity.nextActivity) : null;
        if (next) edge(current, next, "next");
        else if (activity.nextActivity) refer(current, `Activity: ${activity.nextActivity}`, "next");
        for (const conditional of activity.conditionalActivity) {
          const target = conditional.onTrueNextActivity;
          const nextStep = target ? acts.get(target) : null;
          if (nextStep) edge(current, nextStep, "if outcome");
          else if (target) refer(current, `Activity: ${target}`, "if outcome");
          if (conditional.onTrueFinalResult) {
            refer(current, `Result: ${conditional.onTrueFinalResult}`, "final");
          }
        }
      }
      for (const data of diagram.contextDataModel) refer(root, `Data context: ${data}`, "context");
      for (const result of diagram.results) refer(root, `Result: ${parameterLabel(result)}`, "produces");
    }
  }
  if (value.nodes.length === 0) throw new Error(`No declared diagram elements in ${file.path}.`);
  return value;
}

function overviewGraph(files: LinkedFile[]): Graph {
  const { value, add, edge } = graph("System architecture", "All five modelling languages · traceable model inventory");
  const root = add("KIDE engineering system", "root", 0);
  const kinds = [
    ["dml", "Data models"],
    ["op", "Operations"],
    ["mncspec", "Device / control topology"],
    ["cap", "Capabilities"],
    ["activity", "Activity workflows"],
  ] as const;
  for (const [kind, label] of kinds) {
    const category = add(label, "capability", 1);
    edge(root, category, "model layer");
    for (const file of files.filter((candidate) => candidate.kind === kind)) {
      edge(category, add(file.path, "data", 2), "source");
    }
  }
  return value;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function short(value: string, max = 42) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

const palette: Record<NodeKind, [string, string]> = {
  root: ["#e0e7ff", "#3730a3"],
  data: ["#dbeafe", "#1d4ed8"],
  operation: ["#fef3c7", "#92400e"],
  device: ["#ccfbf1", "#115e59"],
  capability: ["#ede9fe", "#6d28d9"],
  activity: ["#dcfce7", "#166534"],
  signal: ["#f1f5f9", "#475569"],
};

/** A self-contained, print-friendly, vector SVG: no CSS variables or external assets. */
export function renderEngineeringSvg(g: Graph): string {
  const columns = [g.nodes.filter((n) => n.lane === 0), g.nodes.filter((n) => n.lane === 1),
    g.nodes.filter((n) => n.lane === 2)];
  const boxW = 312, boxH = 68, colStep = 367, rowStep = 96;
  const positions = new Map<string, { x: number; y: number }>();
  columns.forEach((column, lane) => column.forEach((node, index) =>
    positions.set(node.id, { x: 30 + lane * colStep, y: 132 + index * rowStep })));
  const height = Math.max(320, 184 + Math.max(...columns.map((col) => col.length)) * rowStep);
  const lines = g.edges.map((e) => {
    const from = positions.get(e.from), to = positions.get(e.to);
    if (!from || !to) throw new Error("Diagram refers to an undeclared node.");
    const x1 = from.x + boxW, y1 = from.y + boxH / 2, x2 = to.x, y2 = to.y + boxH / 2;
    const sameColumn = from.x === to.x;
    const d = sameColumn
      ? `M ${x1} ${y1} C ${x1 + 42} ${y1}, ${x2 + boxW + 42} ${y2}, ${x2 + boxW} ${y2}`
      : `M ${x1} ${y1} C ${x1 + 55} ${y1}, ${x2 - 55} ${y2}, ${x2} ${y2}`;
    return `<path d="${d}" stroke="#94a3b8" stroke-width="1.4" fill="none" marker-end="url(#arrow)"><title>${escapeXml(e.label)}</title></path>`;
  }).join("\n");
  const boxes = g.nodes.map((n) => {
    const p = positions.get(n.id)!;
    const [fill, color] = palette[n.kind];
    return `<g><title>${escapeXml(n.label)}${n.description ? " — " + escapeXml(n.description) : ""}</title><rect x="${p.x}" y="${p.y}" width="${boxW}" height="${boxH}" rx="10" fill="${fill}" stroke="${color}" stroke-width="1.1"/><text x="${p.x + 12}" y="${p.y + 27}" font-size="13" font-weight="600" fill="${color}">${escapeXml(short(n.label))}</text><text x="${p.x + 12}" y="${p.y + 48}" font-size="10.5" fill="#334155">${escapeXml(short(n.description || n.kind, 47))}</text></g>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1134" height="${height}" viewBox="0 0 1134 ${height}" role="img" aria-label="${escapeXml(g.title)}">
<title>${escapeXml(g.title)}</title><desc>${escapeXml(g.subtitle)}. ${g.nodes.length} nodes and ${g.edges.length} relationships.</desc>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill="#64748b"/></marker></defs>
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="30" y="40" font-size="24" font-weight="700" fill="#0f172a">${escapeXml(short(g.title, 70))}</text>
<text x="30" y="66" font-size="13" fill="#475569">${escapeXml(g.subtitle)}</text>
<text x="30" y="98" font-size="11" fill="#64748b">Source-derived architecture — not a verified or safety-approved control design</text>
${lines}
${boxes}
</svg>\n`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45) || "model";
}

// Uncompressed ZIP with CRC32, local headers, central directory, and UTF-8 names.
// All input names are generated within this module; raw project paths never enter ZIP paths.
function zip(entries: Array<{ path: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  const encoder32 = (size: number) => new DataView(new ArrayBuffer(size));
  let cursor = 0;
  const push = (chunk: Uint8Array) => { chunks.push(chunk); cursor += chunk.length; };
  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const body = encoder.encode(entry.content);
    if (name.length > 65535 || body.length > 0xffffffff || cursor + body.length > 0xffffffff) {
      throw new Error("Diagram bundle exceeds ZIP size limits.");
    }
    let crc = 0xffffffff;
    for (const b of body) {
      crc ^= b;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const offset = cursor;
    const local = encoder32(30);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, body.length, true);
    local.setUint16(26, name.length, true);
    push(new Uint8Array(local.buffer)); push(name); push(body);
    const head = encoder32(46);
    head.setUint32(0, 0x02014b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 20, true);
    head.setUint16(8, 0x0800, true);
    head.setUint32(16, crc, true);
    head.setUint32(20, body.length, true);
    head.setUint32(24, body.length, true);
    head.setUint16(28, name.length, true);
    head.setUint32(42, offset, true);
    central.push(new Uint8Array(head.buffer), name);
  }
  if (entries.length > 65535) throw new Error("Too many diagram files.");
  const centralStart = cursor;
  for (const item of central) push(item);
  const ending = encoder32(22);
  ending.setUint32(0, 0x06054b50, true);
  ending.setUint16(8, entries.length, true);
  ending.setUint16(10, entries.length, true);
  ending.setUint32(12, cursor - centralStart, true);
  ending.setUint32(16, centralStart, true);
  push(new Uint8Array(ending.buffer));
  const result = new Uint8Array(cursor);
  let position = 0;
  for (const chunk of chunks) { result.set(chunk, position); position += chunk.length; }
  return result;
}

/** Complete local, client-side export; does not make a network request or mutate project data. */
export function buildEngineeringDiagramBundle(workspace: Workspace, context: DiagramExportContext): DiagramBundle {
  if (!context.projectId || !context.organizationId || workspace.files.length === 0) {
    throw new Error("Select a loaded project containing engineering models before exporting.");
  }
  if (workspace.errorCount > 0 || workspace.files.some((file) => !file.result.ast ||
      file.diagnostics.some((diagnostic) => diagnostic.severity === "error"))) {
    throw new Error("Resolve model syntax and cross-model errors before exporting diagrams.");
  }
  const now = context.exportedAt ?? new Date().toISOString();
  const files = [...workspace.files].sort((left, right) => left.path.localeCompare(right.path));
  const entries: Array<{ path: string; content: string }> = [];
  const diagrams: DiagramManifest["diagrams"] = [];
  const addDiagram = (file: string, sourceModel: string | null, g: Graph) => {
    entries.push({ path: file, content: renderEngineeringSvg(g) });
    diagrams.push({ file, title: g.title, sourceModel, nodeCount: g.nodes.length, edgeCount: g.edges.length });
  };
  addDiagram("diagrams/00-system-architecture.svg", null, overviewGraph(files));
  files.forEach((file, index) => {
    addDiagram(`diagrams/${String(index + 1).padStart(2, "0")}-${slug(file.path)}.svg`,
      file.path, graphForFile(file));
  });
  const modelSources = Object.fromEntries(files.map((file) => [file.path, file.source]));
  entries.push({ path: "modelset.json", content: JSON.stringify(exportModelSet(modelSources, now), null, 2) + "\n" });
  const manifest: DiagramManifest = {
    format: "kide.engineering-diagrams/1",
    projectId: context.projectId,
    organizationId: context.organizationId,
    exportedAt: now,
    saveStatus: context.saveStatus,
    status: "snapshot-not-release-approved",
    note: "Derived from the current open browser workspace. Not a certified, reviewed, built or deployed control system. Unsaved edits may be present.",
    diagrams,
    sources: files.map((file) => ({ path: file.path, sha256: sha256(file.source), kind: file.kind })),
    modelSet: "modelset.json",
  };
  entries.push({ path: "manifest.json", content: JSON.stringify(manifest, null, 2) + "\n" });
  return { filename: `kide-engineering-diagrams-${slug(context.projectId).slice(0, 24)}.zip`,
    bytes: zip(entries), manifest };
}

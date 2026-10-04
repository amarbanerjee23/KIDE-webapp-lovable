import type {
  InterfaceDescriptionNode,
  ParameterNode,
  Workspace,
} from "@/lib/dsl";
import { parseMnc } from "@/lib/dsl";
import { sha256 } from "./sha256";
import type { Candidate } from "./synthesis";

export type CodegenTarget = "ros2-python" | "iec61131-st" | "zetta-node";

export const CODEGEN_VERSION = "kide-codegen 1.0.0";

export interface CodegenParameter {
  name: string;
  type: string;
}

export interface CodegenSignal {
  name: string;
  parameters: CodegenParameter[];
}

export interface CodegenNode {
  name: string;
  componentInterface: string;
  commands: CodegenSignal[];
  events: CodegenSignal[];
  responses: CodegenSignal[];
  alarms: CodegenSignal[];
}

export interface SemanticCodegenModel {
  version: string;
  candidateId: string;
  candidateName: string;
  candidateFingerprint: string;
  nodes: CodegenNode[];
  fingerprint: string;
}

export interface CodegenArtifact {
  path: string;
  mediaType: string;
  content: string;
  bytes: number;
  sha256: string;
}

export interface CodegenValidation {
  ready: boolean;
  errors: string[];
  warnings: string[];
}

export interface CodegenBundle {
  target: CodegenTarget;
  label: string;
  generator: string;
  modelFingerprint: string;
  bundleFingerprint: string;
  artifacts: CodegenArtifact[];
  validation: CodegenValidation;
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner) => {
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return Object.fromEntries(
        Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return inner;
  });
}

function parameterType(parameter: ParameterNode): string {
  switch (parameter.node) {
    case "SimpleType":
      return parameter.type;
    case "AbstractType":
      return parameter.typeRef;
    case "ArrayType":
      return `${parameter.primitiveType ?? parameter.dataModelType ?? "object"}[]`;
  }
}

function signal(name: string, parameters: ParameterNode[]): CodegenSignal {
  return {
    name,
    parameters: parameters.map((parameter) => ({
      name: parameter.name,
      type: parameterType(parameter),
    })),
  };
}

function allInterfaces(workspace: Workspace): Map<string, InterfaceDescriptionNode> {
  const out = new Map<string, InterfaceDescriptionNode>();
  for (const file of workspace.files) {
    if (file.result.ast?.node !== "Model") continue;
    for (const iface of file.result.ast.interfaces) out.set(iface.name, iface);
  }
  return out;
}

function requestedByNode(candidate: Candidate, nodeName: string) {
  const activities = new Set(
    candidate.controlNodes.find((node) => node.name === nodeName)?.activities ?? [],
  );
  const bindings = candidate.bindings.filter((binding) => activities.has(binding.activity));
  return {
    commands: new Set(bindings.flatMap((binding) => binding.commands)),
    events: new Set(bindings.flatMap((binding) => binding.observations)),
    alarms: new Set(bindings.flatMap((binding) => binding.alarms)),
  };
}

export function buildSemanticCodegenModel(
  workspace: Workspace,
  candidate: Candidate,
): { model: SemanticCodegenModel | null; validation: CodegenValidation } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (candidate.validation.errors > 0) {
    errors.push("The selected synthesis candidate has validation errors.");
  }

  const parsed = parseMnc(candidate.generatedMnc);
  if (!parsed.ast || parsed.diagnostics.some((entry) => entry.severity === "error")) {
    errors.push("The generated MNC cannot be parsed cleanly.");
  }

  const interfaces = allInterfaces(workspace);
  const nodes: CodegenNode[] = [];

  for (const controlNode of [...candidate.controlNodes].sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const iface = interfaces.get(controlNode.componentInterface);
    if (!iface) {
      errors.push(
        `Control node '${controlNode.name}' references missing interface '${controlNode.componentInterface}'.`,
      );
      continue;
    }

    const requested = requestedByNode(candidate, controlNode.name);
    const commands = iface.commands
      .filter((item) => requested.commands.has(item.name))
      .map((item) => signal(item.name, item.parameters))
      .sort((a, b) => a.name.localeCompare(b.name));
    const events = iface.events
      .filter((item) => requested.events.has(item.name))
      .map((item) => signal(item.name, item.parameters))
      .sort((a, b) => a.name.localeCompare(b.name));
    const responses = iface.responses
      .filter((item) => requested.events.has(item.name))
      .map((item) => signal(item.name, item.parameters))
      .sort((a, b) => a.name.localeCompare(b.name));
    const alarms = iface.alarms
      .filter((item) => requested.alarms.has(item.name))
      .map((item) => signal(item.name, item.parameters))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const name of requested.commands) {
      if (!commands.some((item) => item.name === name)) {
        errors.push(`Command '${name}' is not declared on interface '${iface.name}'.`);
      }
    }
    for (const name of requested.events) {
      if (
        !events.some((item) => item.name === name) &&
        !responses.some((item) => item.name === name)
      ) {
        errors.push(`Observation '${name}' is not declared on interface '${iface.name}'.`);
      }
    }
    for (const name of requested.alarms) {
      if (!alarms.some((item) => item.name === name)) {
        errors.push(`Alarm '${name}' is not declared on interface '${iface.name}'.`);
      }
    }

    nodes.push({
      name: controlNode.name,
      componentInterface: controlNode.componentInterface,
      commands,
      events,
      responses,
      alarms,
    });
  }

  if (nodes.length === 0) errors.push("No generated control nodes are available for code generation.");
  if (errors.length > 0) return { model: null, validation: { ready: false, errors, warnings } };

  const material = {
    version: CODEGEN_VERSION,
    candidateId: candidate.id,
    candidateName: candidate.name,
    candidateFingerprint: sha256(candidate.generatedMnc),
    nodes,
  };
  const model: SemanticCodegenModel = {
    ...material,
    fingerprint: sha256(canonical(material)),
  };

  return { model, validation: { ready: true, errors, warnings } };
}

function safeIdentifier(value: string, style: "snake" | "upper" = "snake"): string {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^([0-9])/, "_$1")
    .replace(/^_+|_+$/g, "");
  const safe = normalized || "generated";
  return style === "upper" ? safe.toUpperCase() : safe.toLowerCase();
}

function pythonType(type: string): string {
  if (type.endsWith("[]")) return "list[object]";
  switch (type) {
    case "int":
      return "int";
    case "float":
      return "float";
    case "boolean":
      return "bool";
    case "string":
    case "date":
      return "str";
    default:
      return "object";
  }
}

function stType(type: string): string {
  if (type.endsWith("[]")) return "STRING";
  switch (type) {
    case "int":
      return "DINT";
    case "float":
      return "LREAL";
    case "boolean":
      return "BOOL";
    default:
      return "STRING";
  }
}

function artifact(path: string, mediaType: string, content: string): CodegenArtifact {
  return {
    path,
    mediaType,
    content,
    bytes: new TextEncoder().encode(content).length,
    sha256: sha256(content),
  };
}

function ros2Artifacts(model: SemanticCodegenModel): CodegenArtifact[] {
  const packageName = `kide_${safeIdentifier(model.candidateName)}`;
  const className = `${model.candidateName.replace(/[^A-Za-z0-9]+/g, "") || "Generated"}Controller`;
  const nodeLines: string[] = [
    '"""Generated by KIDE from an approved semantic control model."""',
    "from __future__ import annotations",
    "",
    "import json",
    "import rclpy",
    "from rclpy.node import Node",
    "from std_msgs.msg import String",
    "",
    "",
    `class ${className}(Node):`,
    "    def __init__(self) -> None:",
    `        super().__init__("${safeIdentifier(model.candidateName)}")`,
    "        self._publishers: dict[str, object] = {}",
  ];

  for (const node of model.nodes) {
    for (const command of node.commands) {
      const key = `${node.componentInterface}.${command.name}`;
      const attr = safeIdentifier(`${node.name}_${command.name}_publisher`);
      const topic = `/${safeIdentifier(node.componentInterface)}/command/${safeIdentifier(command.name)}`;
      nodeLines.push(
        `        self.${attr} = self.create_publisher(String, "${topic}", 10)`,
        `        self._publishers["${key}"] = self.${attr}`,
      );
    }
    for (const event of [...node.events, ...node.responses, ...node.alarms]) {
      const method = safeIdentifier(`on_${node.name}_${event.name}`);
      const category = node.alarms.some((alarm) => alarm.name === event.name)
        ? "alarm"
        : node.responses.some((response) => response.name === event.name)
          ? "response"
          : "event";
      const topic = `/${safeIdentifier(node.componentInterface)}/${category}/${safeIdentifier(event.name)}`;
      nodeLines.push(
        `        self.create_subscription(String, "${topic}", self.${method}, 10)`,
      );
    }
  }

  nodeLines.push("");
  for (const node of model.nodes) {
    for (const command of node.commands) {
      const method = safeIdentifier(`send_${node.name}_${command.name}`);
      const key = `${node.componentInterface}.${command.name}`;
      const args = command.parameters
        .map((parameter) => `${safeIdentifier(parameter.name)}: ${pythonType(parameter.type)}`)
        .join(", ");
      const payload = command.parameters
        .map((parameter) => `"${parameter.name}": ${safeIdentifier(parameter.name)}`)
        .join(", ");
      nodeLines.push(
        `    def ${method}(self${args ? `, ${args}` : ""}) -> None:`,
        "        message = String()",
        `        message.data = json.dumps({${payload}}, sort_keys=True, default=str)`,
        `        self._publishers["${key}"].publish(message)`,
        "",
      );
    }
    for (const event of [...node.events, ...node.responses, ...node.alarms]) {
      const method = safeIdentifier(`on_${node.name}_${event.name}`);
      nodeLines.push(
        `    def ${method}(self, message: String) -> None:`,
        `        self.get_logger().info("${event.name}: %s" % message.data)`,
        "",
      );
    }
  }

  nodeLines.push(
    "",
    "def main(args=None) -> None:",
    "    rclpy.init(args=args)",
    `    node = ${className}()`,
    "    try:",
    "        rclpy.spin(node)",
    "    finally:",
    "        node.destroy_node()",
    "        rclpy.shutdown()",
    "",
    "",
    'if __name__ == "__main__":',
    "    main()",
    "",
  );

  const setup = [
    "from setuptools import setup",
    "",
    `package_name = "${packageName}"`,
    "",
    "setup(",
    "    name=package_name,",
    `    version="1.0.0",`,
    "    packages=[package_name],",
    "    data_files=[],",
    "    install_requires=['setuptools'],",
    "    zip_safe=True,",
    `    description="KIDE generated ROS 2 controller for ${model.candidateName}",`,
    "    license='Apache-2.0',",
    "    entry_points={",
    "        'console_scripts': [",
    `            'controller = ${packageName}.controller:main',`,
    "        ],",
    "    },",
    ")",
    "",
  ].join("\n");

  const packageXml = [
    '<?xml version="1.0"?>',
    '<package format="3">',
    `  <name>${packageName}</name>`,
    "  <version>1.0.0</version>",
    `  <description>KIDE generated ROS 2 controller for ${model.candidateName}</description>`,
    "  <maintainer email=\"engineering@example.invalid\">KIDE Generated</maintainer>",
    "  <license>Apache-2.0</license>",
    "  <exec_depend>rclpy</exec_depend>",
    "  <exec_depend>std_msgs</exec_depend>",
    "</package>",
    "",
  ].join("\n");

  return [
    artifact(`ros2/${packageName}/package.xml`, "application/xml", packageXml),
    artifact(`ros2/${packageName}/setup.py`, "text/x-python", setup),
    artifact(`ros2/${packageName}/${packageName}/__init__.py`, "text/x-python", ""),
    artifact(
      `ros2/${packageName}/${packageName}/controller.py`,
      "text/x-python",
      nodeLines.join("\n"),
    ),
  ];
}

function plcArtifacts(model: SemanticCodegenModel): CodegenArtifact[] {
  const lines: string[] = [
    "(* Generated by KIDE from an approved semantic control model. *)",
    `(* Candidate fingerprint: ${model.candidateFingerprint} *)`,
    "",
  ];

  for (const node of model.nodes) {
    const fb = `FB_${safeIdentifier(node.name, "upper")}`;
    lines.push(`FUNCTION_BLOCK ${fb}`, "VAR_INPUT");
    for (const command of node.commands) {
      lines.push(`    CMD_${safeIdentifier(command.name, "upper")} : BOOL;`);
      for (const parameter of command.parameters) {
        lines.push(
          `    ${safeIdentifier(`${command.name}_${parameter.name}`, "upper")} : ${stType(parameter.type)};`,
        );
      }
    }
    lines.push("END_VAR", "VAR_OUTPUT");
    for (const event of node.events) {
      lines.push(`    EVT_${safeIdentifier(event.name, "upper")} : BOOL;`);
    }
    for (const response of node.responses) {
      lines.push(`    RSP_${safeIdentifier(response.name, "upper")} : BOOL;`);
    }
    for (const alarm of node.alarms) {
      lines.push(`    ALM_${safeIdentifier(alarm.name, "upper")} : BOOL;`);
    }
    if (node.events.length === 0 && node.responses.length === 0 && node.alarms.length === 0) {
      lines.push("    READY : BOOL;");
    }
    lines.push("END_VAR", "");

    for (const command of node.commands) {
      const cmd = safeIdentifier(command.name, "upper");
      lines.push(
        `IF CMD_${cmd} THEN`,
        `    (* Dispatch ${node.componentInterface}.${command.name} through the bound device adapter. *)`,
        "END_IF;",
        "",
      );
    }
    lines.push("END_FUNCTION_BLOCK", "");
  }

  return [
    artifact(
      `plc/${safeIdentifier(model.candidateName)}.st`,
      "text/x-iec61131",
      lines.join("\n"),
    ),
  ];
}

function zettaArtifacts(model: SemanticCodegenModel): CodegenArtifact[] {
  const driverName = `${model.candidateName.replace(/[^A-Za-z0-9]+/g, "") || "Generated"}Controller`;
  const lines: string[] = [
    "'use strict';",
    "",
    "const util = require('util');",
    "const Device = require('zetta-device');",
    "",
    `const ${driverName} = module.exports = function ${driverName}() {`,
    "  Device.call(this);",
    "};",
    "",
    `util.inherits(${driverName}, Device);`,
    "",
    `${driverName}.prototype.init = function init(config) {`,
    "  config",
    `    .type('${driverName}')`,
    `    .name('${model.candidateName.replace(/'/g, "\\'")}')`,
    "    .state('ready')",
  ];

  const commandMethods = model.nodes.flatMap((node) =>
    node.commands.map((command) => ({
      method: safeIdentifier(`${node.name}_${command.name}`),
      command,
      node,
    })),
  );

  if (commandMethods.length === 0) {
    lines.push("    ;");
  } else {
    for (let index = 0; index < commandMethods.length; index += 1) {
      const entry = commandMethods[index]!;
      const prefix = index === 0 ? "    .when('ready', {" : "    .when('ready', {";
      const params = entry.command.parameters
        .map((parameter) => `${safeIdentifier(parameter.name)}: { type: '${parameter.type}' }`)
        .join(", ");
      lines.push(
        `${prefix} ${entry.method}: { handler: this.${entry.method}, inputs: { ${params} } } })`,
      );
    }
    lines.push("    ;");
  }
  lines.push("};", "");

  for (const entry of commandMethods) {
    const args = entry.command.parameters.map((parameter) => safeIdentifier(parameter.name));
    lines.push(
      `${driverName}.prototype.${entry.method} = function ${entry.method}(${[
        ...args,
        "callback",
      ].join(", ")}) {`,
      `  // Semantic dispatch hook: ${entry.node.componentInterface}.${entry.command.name}`,
      "  callback();",
      "};",
      "",
    );
  }

  const packageJson = JSON.stringify(
    {
      name: `kide-${safeIdentifier(model.candidateName)}-zetta`,
      version: "1.0.0",
      private: true,
      main: "index.js",
      dependencies: {
        "zetta-device": "^0.22.0",
      },
    },
    null,
    2,
  );

  return [
    artifact("zetta/package.json", "application/json", `${packageJson}\n`),
    artifact("zetta/index.js", "text/javascript", lines.join("\n")),
  ];
}

function validateArtifacts(target: CodegenTarget, artifacts: CodegenArtifact[]): CodegenValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const paths = new Set<string>();

  for (const entry of artifacts) {
    if (paths.has(entry.path)) errors.push(`Duplicate generated path '${entry.path}'.`);
    paths.add(entry.path);
    if (entry.sha256 !== sha256(entry.content)) {
      errors.push(`Checksum mismatch for '${entry.path}'.`);
    }
    if (entry.bytes !== new TextEncoder().encode(entry.content).length) {
      errors.push(`Byte count mismatch for '${entry.path}'.`);
    }
  }

  if (target === "ros2-python") {
    if (!artifacts.some((entry) => entry.path.endsWith("/controller.py"))) {
      errors.push("ROS 2 bundle is missing controller.py.");
    }
    if (!artifacts.some((entry) => entry.path.endsWith("/package.xml"))) {
      errors.push("ROS 2 bundle is missing package.xml.");
    }
  } else if (target === "iec61131-st") {
    const source = artifacts.find((entry) => entry.path.endsWith(".st"))?.content ?? "";
    const starts = (source.match(/\bFUNCTION_BLOCK\b/g) ?? []).length;
    const ends = (source.match(/\bEND_FUNCTION_BLOCK\b/g) ?? []).length;
    if (starts === 0 || starts !== ends) errors.push("Structured Text function blocks are unbalanced.");
  } else {
    if (!artifacts.some((entry) => entry.path.endsWith("index.js"))) {
      errors.push("Zetta bundle is missing index.js.");
    }
  }

  return { ready: errors.length === 0, errors, warnings };
}

export function generateCode(
  workspace: Workspace,
  candidate: Candidate,
  target: CodegenTarget,
): CodegenBundle {
  const built = buildSemanticCodegenModel(workspace, candidate);
  if (!built.model) {
    return {
      target,
      label: targetLabel(target),
      generator: CODEGEN_VERSION,
      modelFingerprint: "",
      bundleFingerprint: "",
      artifacts: [],
      validation: built.validation,
    };
  }

  const artifacts =
    target === "ros2-python"
      ? ros2Artifacts(built.model)
      : target === "iec61131-st"
        ? plcArtifacts(built.model)
        : zettaArtifacts(built.model);
  const targetValidation = validateArtifacts(target, artifacts);
  const validation: CodegenValidation = {
    ready: built.validation.ready && targetValidation.ready,
    errors: [...built.validation.errors, ...targetValidation.errors],
    warnings: [...built.validation.warnings, ...targetValidation.warnings],
  };
  const bundleMaterial = {
    target,
    generator: CODEGEN_VERSION,
    modelFingerprint: built.model.fingerprint,
    artifacts: artifacts.map(({ path, mediaType, bytes, sha256: hash }) => ({
      path,
      mediaType,
      bytes,
      sha256: hash,
    })),
  };

  return {
    target,
    label: targetLabel(target),
    generator: CODEGEN_VERSION,
    modelFingerprint: built.model.fingerprint,
    bundleFingerprint: sha256(canonical(bundleMaterial)),
    artifacts,
    validation,
  };
}

export function targetLabel(target: CodegenTarget): string {
  switch (target) {
    case "ros2-python":
      return "ROS 2 Python";
    case "iec61131-st":
      return "IEC 61131-3 Structured Text";
    case "zetta-node":
      return "Zetta Node.js";
  }
}

export const CODEGEN_TARGETS: CodegenTarget[] = ["ros2-python", "iec61131-st", "zetta-node"];

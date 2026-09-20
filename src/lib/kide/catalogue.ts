/**
 * Capability catalogue.
 *
 * Reads the linked workspace and describes, for every declared capability,
 * what it can do, which device interface backs it, whether it is eligible for
 * use in a workflow, and why — with the exact reason when it is not.
 */
import type {
  CapabilityFileNode,
  CapabilityNode,
  InterfaceDescriptionNode,
  MncModelNode,
  ActivityFileNode,
  Workspace,
} from "@/lib/dsl";

export interface CatalogueEntry {
  name: string;
  componentInterface: string | null;
  commands: string[];
  events: string[];
  alarms: string[];
  dataPoints: string[];
  outcomes: string[];
  usedBy: string[];
  eligible: boolean;
  reasons: string[];
  origin: "authored";
}

export interface DeviceEntry {
  name: string;
  commands: string[];
  events: string[];
  alarms: string[];
  dataPoints: string[];
  responses: string[];
  backedCapabilities: string[];
}

export interface Catalogue {
  capabilities: CatalogueEntry[];
  devices: DeviceEntry[];
  eligibleCount: number;
}

export function buildCatalogue(workspace: Workspace): Catalogue {
  const interfaces: InterfaceDescriptionNode[] = [];
  const capabilities: CapabilityNode[] = [];
  const activityUse = new Map<string, string[]>();

  for (const file of workspace.files) {
    const ast = file.result.ast;
    if (!ast) continue;
    if (ast.node === "Model") interfaces.push(...(ast as MncModelNode).interfaces);
    if (ast.node === "CapabilityFile") capabilities.push(...(ast as CapabilityFileNode).capabilities);
    if (ast.node === "ActivityFile") {
      for (const diagram of (ast as ActivityFileNode).diagrams) {
        for (const activity of diagram.activities) {
          const capability = activity.requiredCapability ?? activity.bindCapability;
          if (!capability) continue;
          activityUse.set(capability, [...(activityUse.get(capability) ?? []), activity.name]);
        }
      }
    }
  }

  const entries: CatalogueEntry[] = capabilities
    .map((capability) => {
      const interfaceName = capability.componentInterface[0] ?? null;
      const device = interfaces.find((entry) => entry.name === interfaceName) ?? null;
      const control = capability.providesControlCapabilities;
      const outcome = capability.providesOutcomes;
      const commands = control?.commands ?? [];
      const reasons: string[] = [];

      if (!interfaceName) {
        reasons.push("The capability names no component interface, so nothing can execute it.");
      } else if (!device) {
        reasons.push(
          `Component interface '${interfaceName}' is not described in any control model, so the device contract is unknown.`,
        );
      }
      if (commands.length === 0) {
        reasons.push("The capability exposes no fireable command, so it cannot act on the device.");
      }
      if (device) {
        for (const command of commands) {
          if (!device.commands.some((entry) => entry.name === command)) {
            reasons.push(`Command '${command}' is not offered by '${device.name}'.`);
          }
        }
        for (const alarm of control?.alarms ?? []) {
          if (!device.alarms.some((entry) => entry.name === alarm)) {
            reasons.push(`Alarm '${alarm}' is not raised by '${device.name}'.`);
          }
        }
      }

      return {
        name: capability.name,
        componentInterface: interfaceName,
        commands,
        events: control?.events ?? [],
        alarms: control?.alarms ?? [],
        dataPoints: control?.dataPoints ?? [],
        outcomes: [
          ...(outcome?.responses ?? []),
          ...(outcome?.events ?? []),
          ...(outcome?.alarms ?? []),
          ...(outcome?.dataPoints ?? []),
        ],
        usedBy: activityUse.get(capability.name) ?? [],
        eligible: reasons.length === 0,
        reasons,
        origin: "authored" as const,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const devices: DeviceEntry[] = interfaces
    .map((device) => ({
      name: device.name,
      commands: device.commands.map((entry) => entry.name),
      events: device.events.map((entry) => entry.name),
      alarms: device.alarms.map((entry) => entry.name),
      dataPoints: device.dataPoints.map((entry) => entry.name),
      responses: device.responses.map((entry) => entry.name),
      backedCapabilities: entries
        .filter((entry) => entry.componentInterface === device.name)
        .map((entry) => entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    capabilities: entries,
    devices,
    eligibleCount: entries.filter((entry) => entry.eligible).length,
  };
}

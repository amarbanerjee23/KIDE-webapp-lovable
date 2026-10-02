import type {
  ActivityFileNode,
  Workspace,
} from "@/lib/dsl";
import type {
  GlobalDeviceCandidate,
  GlobalKnowledgeSnapshot,
} from "@/lib/knowledge/contracts";
import type { SynthesisReport } from "./synthesis";
import { sha256 } from "./sha256";

export interface ShadowCapabilityMatch {
  requiredCapability: string;
  matchedDevices: {
    semanticId: string;
    label: string;
    capabilityId: string;
    sourceFingerprint: string;
    confidence: number;
  }[];
}

export interface GraphSynthesisShadowReport {
  mode: "shadow";
  applied: false;
  baselineSynthesisFingerprint: string;
  graphSnapshotFingerprint: string;
  requiredCapabilities: string[];
  matches: ShadowCapabilityMatch[];
  missingCapabilities: string[];
  incompleteContracts: string[];
  promotionEligible: boolean;
  notes: string[];
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

function fingerprint(value: unknown): string {
  return sha256(JSON.stringify(stable(value)));
}

function requiredCapabilities(workspace: Workspace): string[] {
  const names = new Set<string>();
  for (const file of workspace.files) {
    if (file.result.ast?.node !== "ActivityFile") continue;
    for (const diagram of (file.result.ast as ActivityFileNode).diagrams) {
      for (const activity of diagram.activities) {
        const capability = activity.requiredCapability ?? activity.bindCapability ?? null;
        if (capability) names.add(capability);
      }
    }
  }
  return [...names].sort();
}

function complete(device: GlobalDeviceCandidate, capabilityId: string): boolean {
  const capability = device.capabilities.find((entry) => entry.semanticId === capabilityId);
  if (!capability) return false;
  return (
    capability.interfaceIds.length > 0 &&
    capability.behaviorIds.length > 0 &&
    capability.contextIds.length > 0 &&
    capability.preconditionIds.length > 0 &&
    capability.postconditionIds.length > 0
  );
}

export function assessGraphSynthesisShadow(
  workspace: Workspace,
  baseline: SynthesisReport,
  snapshot: GlobalKnowledgeSnapshot,
): GraphSynthesisShadowReport {
  const required = requiredCapabilities(workspace);
  const matches: ShadowCapabilityMatch[] = [];
  const incompleteContracts: string[] = [];

  for (const requiredCapability of required) {
    const matchedDevices: ShadowCapabilityMatch["matchedDevices"] = [];

    for (const device of [...snapshot.devices].sort((a, b) =>
      a.semanticId.localeCompare(b.semanticId),
    )) {
      for (const capability of device.capabilities) {
        if (capability.label !== requiredCapability) continue;
        if (!complete(device, capability.semanticId)) {
          incompleteContracts.push(
            `${device.semanticId} / ${capability.semanticId} (${requiredCapability})`,
          );
          continue;
        }
        matchedDevices.push({
          semanticId: device.semanticId,
          label: device.label,
          capabilityId: capability.semanticId,
          sourceFingerprint: device.sourceFingerprint,
          confidence: device.confidence,
        });
      }
    }

    matches.push({ requiredCapability, matchedDevices });
  }

  const missingCapabilities = matches
    .filter((entry) => entry.matchedDevices.length === 0)
    .map((entry) => entry.requiredCapability);

  const graphMaterial = snapshot.devices
    .map((device) => ({
      semanticId: device.semanticId,
      label: device.label,
      manufacturer: device.manufacturer,
      model: device.model,
      sourceUri: device.sourceUri,
      sourceLicense: device.sourceLicense,
      sourceVersion: device.sourceVersion,
      retrievedAt: device.retrievedAt,
      confidence: device.confidence,
      sourceFingerprint: device.sourceFingerprint,
      capabilities: [...device.capabilities].sort((a, b) =>
        a.semanticId.localeCompare(b.semanticId),
      ),
    }))
    .sort((a, b) => a.semanticId.localeCompare(b.semanticId));

  const baselineMaterial = {
    generator: baseline.generator,
    diagram: baseline.diagram,
    ready: baseline.ready,
    blockedReason: baseline.blockedReason,
    preflight: baseline.preflight,
    candidates: baseline.candidates.map((candidate) => ({
      id: candidate.id,
      scores: candidate.scores,
      bindings: candidate.bindings,
      generatedMnc: candidate.generatedMnc,
      validation: candidate.validation,
    })),
  };

  const promotionEligible =
    baseline.ready &&
    required.length > 0 &&
    missingCapabilities.length === 0 &&
    incompleteContracts.length === 0;

  return {
    mode: "shadow",
    applied: false,
    baselineSynthesisFingerprint: fingerprint(baselineMaterial),
    graphSnapshotFingerprint: fingerprint(graphMaterial),
    requiredCapabilities: required,
    matches,
    missingCapabilities,
    incompleteContracts: [...new Set(incompleteContracts)].sort(),
    promotionEligible,
    notes: [
      "Graph knowledge was observed only; it did not alter synthesis inputs or candidate ranking.",
      "Promotion requires an explicit future feature flag plus qualification and release-gate changes.",
    ],
  };
}

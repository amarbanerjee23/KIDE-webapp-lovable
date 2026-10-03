import type { Workspace } from "@/lib/dsl";
import type { GlobalKnowledgeSnapshot } from "@/lib/knowledge/contracts";
import { QUALIFICATION_VERSION } from "./qualification";
import { sha256 } from "./sha256";
import { evaluateGraphAssistance } from "./graph-synthesis-assistance";
import { GENERATOR_VERSION, type SynthesisReport } from "./synthesis";

export interface GraphInputBinding {
  requiredCapability: string;
  deviceSemanticId: string;
  deviceLabel: string;
  capabilityId: string;
  sourceFingerprint: string;
  confidence: number;
}

export interface GraphSynthesisInputEvidence {
  mode: "graph-assisted-inputs";
  workspaceFingerprint: string;
  graphSnapshotFingerprint: string;
  baselineSynthesisFingerprint: string;
  generatorVersion: string;
  qualificationVersion: string;
  sourceFingerprints: string[];
  bindings: GraphInputBinding[];
}

export interface GraphSynthesisPromotionResult {
  applied: boolean;
  reason: string;
  report: SynthesisReport;
  evidence: GraphSynthesisInputEvidence | null;
}

export function graphSynthesisInputsEnabled(value: unknown): boolean {
  return value === "1" || value === "true";
}

function workspaceFingerprint(workspace: Workspace): string {
  const material = [...workspace.files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => ({ path: file.path, source: file.source }));
  return sha256(JSON.stringify(material));
}

export function promoteGraphSynthesisInputs(
  workspace: Workspace,
  baseline: SynthesisReport,
  snapshot: GlobalKnowledgeSnapshot | null,
  enabled: boolean,
  unavailableReason?: string,
): GraphSynthesisPromotionResult {
  if (!enabled) {
    return {
      applied: false,
      reason: "Graph-assisted synthesis inputs are disabled.",
      report: baseline,
      evidence: null,
    };
  }

  const assistance = evaluateGraphAssistance(
    workspace,
    baseline,
    snapshot,
    true,
    unavailableReason,
  );

  if (assistance.status !== "active" || !assistance.shadow) {
    return {
      applied: false,
      reason: assistance.reason,
      report: baseline,
      evidence: null,
    };
  }

  const bindings: GraphInputBinding[] = assistance.recommendations.map((entry) => {
    const selected = [...entry.devices].sort(
      (a, b) =>
        b.confidence - a.confidence ||
        a.semanticId.localeCompare(b.semanticId) ||
        a.capabilityId.localeCompare(b.capabilityId),
    )[0];

    if (!selected) {
      throw new Error(`Qualified graph capability '${entry.requiredCapability}' has no device.`);
    }

    return {
      requiredCapability: entry.requiredCapability,
      deviceSemanticId: selected.semanticId,
      deviceLabel: selected.label,
      capabilityId: selected.capabilityId,
      sourceFingerprint: selected.sourceFingerprint,
      confidence: selected.confidence,
    };
  });

  return {
    applied: true,
    reason:
      "Qualified graph bindings are active as synthesis input evidence. Executable commands and generated MNC still come only from validated project models.",
    report: baseline,
    evidence: {
      mode: "graph-assisted-inputs",
      workspaceFingerprint: workspaceFingerprint(workspace),
      graphSnapshotFingerprint: assistance.shadow.graphSnapshotFingerprint,
      baselineSynthesisFingerprint: assistance.shadow.baselineSynthesisFingerprint,
      generatorVersion: GENERATOR_VERSION,
      qualificationVersion: QUALIFICATION_VERSION,
      sourceFingerprints: [...new Set(bindings.map((binding) => binding.sourceFingerprint))].sort(),
      bindings,
    },
  };
}

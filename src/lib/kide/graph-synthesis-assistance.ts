import type { Workspace } from "@/lib/dsl";
import type { GlobalKnowledgeSnapshot } from "@/lib/knowledge/contracts";
import {
  assessGraphSynthesisShadow,
  type GraphSynthesisShadowReport,
  type ShadowCapabilityMatch,
} from "./graph-synthesis-shadow";
import type { SynthesisReport } from "./synthesis";

export type GraphAssistanceStatus = "disabled" | "loading" | "active" | "blocked" | "unavailable";

export interface GraphAssistanceRecommendation {
  requiredCapability: string;
  devices: ShadowCapabilityMatch["matchedDevices"];
}

export interface GraphAssistanceResult {
  status: GraphAssistanceStatus;
  applied: boolean;
  reason: string;
  shadow: GraphSynthesisShadowReport | null;
  recommendations: GraphAssistanceRecommendation[];
}

export function graphAssistanceEnabled(value: unknown): boolean {
  return value === "1" || value === "true";
}

export function evaluateGraphAssistance(
  workspace: Workspace,
  baseline: SynthesisReport,
  snapshot: GlobalKnowledgeSnapshot | null,
  enabled: boolean,
  unavailableReason?: string,
): GraphAssistanceResult {
  if (!enabled) {
    return {
      status: "disabled",
      applied: false,
      reason: "Graph-assisted candidate enrichment is disabled.",
      shadow: null,
      recommendations: [],
    };
  }

  if (!snapshot) {
    return {
      status: unavailableReason ? "unavailable" : "loading",
      applied: false,
      reason: unavailableReason ?? "Trusted graph knowledge is loading.",
      shadow: null,
      recommendations: [],
    };
  }

  const shadow = assessGraphSynthesisShadow(workspace, baseline, snapshot);
  if (!shadow.promotionEligible) {
    const details = [
      shadow.missingCapabilities.length > 0
        ? `missing: ${shadow.missingCapabilities.join(", ")}`
        : null,
      shadow.incompleteContracts.length > 0
        ? `incomplete contracts: ${shadow.incompleteContracts.length}`
        : null,
      !baseline.ready ? "baseline synthesis is blocked" : null,
    ].filter(Boolean);

    return {
      status: "blocked",
      applied: false,
      reason: `Graph recommendations are blocked (${details.join("; ")}).`,
      shadow,
      recommendations: [],
    };
  }

  return {
    status: "active",
    applied: true,
    reason:
      "Qualified graph knowledge is enriching device recommendations only; synthesis output and ranking are unchanged.",
    shadow,
    recommendations: shadow.matches.map((match) => ({
      requiredCapability: match.requiredCapability,
      devices: match.matchedDevices,
    })),
  };
}

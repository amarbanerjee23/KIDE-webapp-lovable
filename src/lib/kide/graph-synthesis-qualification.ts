import type { Workspace } from "@/lib/dsl";
import type { GlobalKnowledgeSnapshot } from "@/lib/knowledge/contracts";
import { buildAssurance } from "./assurance";
import {
  assessGraphSynthesisShadow,
  type GraphSynthesisShadowReport,
} from "./graph-synthesis-shadow";
import { buildRelease } from "./release";
import { synthesize } from "./synthesis";

export interface GraphQualificationCaseResult {
  name: string;
  shadow: GraphSynthesisShadowReport;
  baselineManifestHash: string;
  repeatedManifestHash: string;
  qualificationStable: boolean;
  assuranceStable: boolean;
  releaseStable: boolean;
  passed: boolean;
}

export function qualifyGraphShadowCase(
  name: string,
  workspace: Workspace,
  snapshot: GlobalKnowledgeSnapshot,
): GraphQualificationCaseResult {
  const baselineReport = synthesize(workspace);
  const baselineAssurance = buildAssurance(workspace, baselineReport, null);
  const baselineRelease = buildRelease(
    workspace,
    baselineReport,
    baselineAssurance,
    "graph-shadow-corpus",
  );

  const shadow = assessGraphSynthesisShadow(workspace, baselineReport, snapshot);

  const repeatedReport = synthesize(workspace);
  const repeatedAssurance = buildAssurance(workspace, repeatedReport, null);
  const repeatedRelease = buildRelease(
    workspace,
    repeatedReport,
    repeatedAssurance,
    "graph-shadow-corpus",
  );

  const qualificationStable =
    JSON.stringify(baselineAssurance.qualification) ===
    JSON.stringify(repeatedAssurance.qualification);
  const assuranceStable =
    JSON.stringify(baselineAssurance.gates) === JSON.stringify(repeatedAssurance.gates) &&
    JSON.stringify(baselineAssurance.findings) === JSON.stringify(repeatedAssurance.findings) &&
    baselineAssurance.tracedPercent === repeatedAssurance.tracedPercent;
  const releaseStable = baselineRelease.manifestHash === repeatedRelease.manifestHash;

  return {
    name,
    shadow,
    baselineManifestHash: baselineRelease.manifestHash,
    repeatedManifestHash: repeatedRelease.manifestHash,
    qualificationStable,
    assuranceStable,
    releaseStable,
    passed: shadow.applied === false && qualificationStable && assuranceStable && releaseStable,
  };
}

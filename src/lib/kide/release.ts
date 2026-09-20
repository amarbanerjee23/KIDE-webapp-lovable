/**
 * Release Centre.
 *
 * Packages the qualified state of a project into a versioned bundle: the five
 * source models, the generated control model, the evidence ledger, the
 * traceability matrix and the gate results — each artefact checksummed, with
 * a manifest that is itself checksummed. The bundle is only marked releasable
 * when every gate passes; a blocked bundle can still be exported for review,
 * clearly labelled as such.
 */
import type { Workspace } from "@/lib/dsl";
import type { SynthesisReport } from "./synthesis";
import type { AssuranceReport } from "./assurance";
import { sha256 } from "./sha256";

export interface ReleaseArtifact {
  path: string;
  kind: "model" | "generated" | "evidence" | "report";
  bytes: number;
  sha256: string;
  content: string;
}

export interface ReleaseBundle {
  version: string;
  generator: string;
  design: string | null;
  releasable: boolean;
  blockedBy: string[];
  artifacts: ReleaseArtifact[];
  manifest: string;
  manifestHash: string;
}

function artifact(
  path: string,
  kind: ReleaseArtifact["kind"],
  content: string,
): ReleaseArtifact {
  return {
    path,
    kind,
    content,
    bytes: new TextEncoder().encode(content).length,
    sha256: sha256(content),
  };
}

/** Stable stringify so the same inputs always produce the same checksum. */
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

export function buildRelease(
  workspace: Workspace,
  report: SynthesisReport,
  assurance: AssuranceReport,
  version: string,
): ReleaseBundle {
  const candidate = assurance.candidate;
  const artifacts: ReleaseArtifact[] = [];

  for (const file of [...workspace.files].sort((a, b) => a.path.localeCompare(b.path))) {
    artifacts.push(artifact(`models/${file.path}`, "model", file.source));
  }

  if (candidate) {
    artifacts.push(
      artifact(`generated/${candidate.name}.mncspec`, "generated", candidate.generatedMnc),
      artifact("evidence/ledger.json", "evidence", canonical(candidate.evidence)),
      artifact(
        "evidence/validation.json",
        "evidence",
        canonical({
          generator: report.generator,
          design: candidate.name,
          scores: candidate.scores,
          independentValidation: candidate.validation,
        }),
      ),
    );
  }

  artifacts.push(
    artifact("reports/traceability.json", "report", canonical(assurance.traceability)),
    artifact("reports/gates.json", "report", canonical(assurance.gates)),
    artifact("evidence/qualification.json", "evidence", canonical(assurance.qualification)),
    artifact("evidence/desktop-conformance.json", "evidence", canonical(assurance.qualification.conformance)),
    artifact("reports/findings.json", "report", canonical(assurance.findings)),
  );

  const blockedBy = assurance.gates
    .filter((gate) => gate.status === "fail")
    .map((gate) => gate.label);

  const manifest = canonical({
    version,
    generator: report.generator,
    design: candidate?.name ?? null,
    releasable: blockedBy.length === 0,
    blockedBy,
    tracedPercent: assurance.tracedPercent,
    artifacts: artifacts.map(({ path, kind, bytes, sha256: hash }) => ({
      path,
      kind,
      bytes,
      sha256: hash,
    })),
  });

  return {
    version,
    generator: report.generator,
    design: candidate?.name ?? null,
    releasable: blockedBy.length === 0,
    blockedBy,
    artifacts,
    manifest,
    manifestHash: sha256(manifest),
  };
}

import { createServerFn } from "@tanstack/react-start";
import { requireKideAuth } from "@/lib/auth-middleware";
import {
  iso,
  recordAudit,
  requireProjectAccess,
  REVIEW_ROLES,
} from "@/lib/data-access.server";
import type { GraphSynthesisInputEvidence } from "@/lib/kide/graph-synthesis-promotion";

export interface PersistedReleaseApproval {
  candidateId: string;
  candidateName: string;
  fingerprint: string;
  approvedAt: string;
  approvedBy: string;
  graphAssistance?: {
    graphSnapshotFingerprint: string;
    baselineSynthesisFingerprint: string;
    sourceFingerprints: string[];
  };
  graphSynthesisInputs?: GraphSynthesisInputEvidence;
}

function assertFingerprint(value: string) {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error("Release approval fingerprint must be a SHA-256 value.");
  }
}

export const loadProjectReleaseApproval = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data, context }): Promise<PersistedReleaseApproval | null> => {
    await requireProjectAccess(context.db, context.userId, data.projectId);

    const rows = await context.db<
      {
        candidate_id: string;
        candidate_name: string;
        fingerprint: string;
        graph_assistance: PersistedReleaseApproval["graphAssistance"] | null;
        graph_synthesis_inputs: GraphSynthesisInputEvidence | null;
        approved_by: string;
        approved_at: string | Date;
      }[]
    >`
      SELECT
        candidate_id,
        candidate_name,
        fingerprint,
        graph_assistance,
        graph_synthesis_inputs,
        approved_by,
        approved_at
      FROM public.release_approvals
      WHERE project_id = ${data.projectId}::uuid
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) return null;

    return {
      candidateId: row.candidate_id,
      candidateName: row.candidate_name,
      fingerprint: row.fingerprint,
      approvedAt: iso(row.approved_at) ?? "",
      approvedBy: row.approved_by,
      ...(row.graph_assistance ? { graphAssistance: row.graph_assistance } : {}),
      ...(row.graph_synthesis_inputs
        ? { graphSynthesisInputs: row.graph_synthesis_inputs }
        : {}),
    };
  });

export const saveProjectReleaseApproval = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator(
    (input: {
      projectId: string;
      candidateId: string;
      candidateName: string;
      fingerprint: string;
      graphAssistance?: PersistedReleaseApproval["graphAssistance"];
      graphSynthesisInputs?: GraphSynthesisInputEvidence;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<PersistedReleaseApproval> => {
    const project = await requireProjectAccess(
      context.db,
      context.userId,
      data.projectId,
      REVIEW_ROLES,
    );

    const candidateId = data.candidateId.trim().slice(0, 160);
    const candidateName = data.candidateName.trim().slice(0, 160);
    if (!candidateId || !candidateName) throw new Error("A release candidate is required.");
    assertFingerprint(data.fingerprint);

    const approvedAt = new Date().toISOString();

    await context.db`
      INSERT INTO public.release_approvals (
        project_id,
        candidate_id,
        candidate_name,
        fingerprint,
        graph_assistance,
        graph_synthesis_inputs,
        approved_by,
        approved_at,
        updated_at
      )
      VALUES (
        ${data.projectId}::uuid,
        ${candidateId},
        ${candidateName},
        ${data.fingerprint},
        ${data.graphAssistance ? context.db.json(data.graphAssistance) : null},
        ${data.graphSynthesisInputs ? context.db.json(data.graphSynthesisInputs) : null},
        ${context.userId}::uuid,
        ${approvedAt}::timestamptz,
        ${approvedAt}::timestamptz
      )
      ON CONFLICT (project_id) DO UPDATE SET
        candidate_id = EXCLUDED.candidate_id,
        candidate_name = EXCLUDED.candidate_name,
        fingerprint = EXCLUDED.fingerprint,
        graph_assistance = EXCLUDED.graph_assistance,
        graph_synthesis_inputs = EXCLUDED.graph_synthesis_inputs,
        approved_by = EXCLUDED.approved_by,
        approved_at = EXCLUDED.approved_at,
        updated_at = EXCLUDED.updated_at
    `;

    await recordAudit(
      context.db,
      context.userId,
      project.organization_id,
      "release.approved",
      "release_approval",
      data.projectId,
      {
        candidateId,
        candidateName,
        fingerprint: data.fingerprint,
      },
      data.projectId,
    );

    return {
      candidateId,
      candidateName,
      fingerprint: data.fingerprint,
      approvedAt,
      approvedBy: context.userId,
      ...(data.graphAssistance ? { graphAssistance: data.graphAssistance } : {}),
      ...(data.graphSynthesisInputs
        ? { graphSynthesisInputs: data.graphSynthesisInputs }
        : {}),
    };
  });

export const revokeProjectReleaseApproval = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data, context }) => {
    const project = await requireProjectAccess(
      context.db,
      context.userId,
      data.projectId,
      REVIEW_ROLES,
    );

    const rows = await context.db<{ fingerprint: string }[]>`
      DELETE FROM public.release_approvals
      WHERE project_id = ${data.projectId}::uuid
      RETURNING fingerprint
    `;

    if (rows[0]) {
      await recordAudit(
        context.db,
        context.userId,
        project.organization_id,
        "release.approval_revoked",
        "release_approval",
        data.projectId,
        { fingerprint: rows[0].fingerprint },
        data.projectId,
      );
    }

    return { ok: true };
  });

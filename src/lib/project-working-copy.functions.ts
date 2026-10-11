import { createServerFn } from "@tanstack/react-start";
import { requireKideAuth } from "@/lib/auth-middleware";
import { EDIT_ROLES, iso, requireProjectAccess } from "@/lib/data-access.server";
import {
  assertSingleWorkingCopy,
  assertWorkingCopyVersion,
  requireVerifiedStoredSources,
  validateWorkingCopySources,
  WORKING_COPY_CONFLICT_MESSAGE,
  WORKING_COPY_LABEL,
} from "@/lib/project-working-copy";

export const loadProjectWorkingCopy = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data, context }) => {
    const project = await requireProjectAccess(context.db, context.userId, data.projectId);

    const rows = await context.db<{ sources: Record<string, string>; created_at: string | Date }[]>`
      SELECT sources, created_at
      FROM public.model_checkpoints
      WHERE project_id = ${data.projectId}::uuid
        AND label = ${WORKING_COPY_LABEL}
      ORDER BY created_at DESC, id DESC
      LIMIT 2
    `;
    assertSingleWorkingCopy(rows);
    const row = rows[0];

    return {
      sources: row ? requireVerifiedStoredSources(row.sources) : null,
      savedAt: iso(row?.created_at),
      canEdit: EDIT_ROLES.includes(project.role),
    };
  });

export const saveProjectWorkingCopy = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator(
    (input: {
      projectId: string;
      sources: Record<string, string>;
      expectedSavedAt: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const project = await requireProjectAccess(
      context.db,
      context.userId,
      data.projectId,
      EDIT_ROLES,
    );

    const sources = validateWorkingCopySources(data.sources);
    // Serialize *initial inserts* as well as updates. When a project has no
    // working copy yet, timestamp CAS alone does not stop two sessions from
    // both inserting distinct rows. Lock the durable project row and re-read
    // the source revision inside the same PostgreSQL transaction.
    return context.db.begin(async (transaction) => {
      const locked = await transaction<{ id: string }[]>`
        SELECT id
        FROM public.projects
        WHERE id = ${project.id}::uuid
        FOR UPDATE
      `;
      if (!locked[0]) throw new Error("Project no longer exists.");

      const existingRows = await transaction<{ id: string; created_at: string | Date }[]>`
        SELECT id, created_at
        FROM public.model_checkpoints
        WHERE project_id = ${data.projectId}::uuid
          AND label = ${WORKING_COPY_LABEL}
        ORDER BY created_at DESC, id DESC
        LIMIT 2
      `;
      assertSingleWorkingCopy(existingRows);

      const existing = existingRows[0];
      const existingSavedAt = iso(existing?.created_at);
      assertWorkingCopyVersion(data.expectedSavedAt, existingSavedAt);

      const now = new Date().toISOString();
      if (existing?.id) {
        if (!data.expectedSavedAt) throw new Error(WORKING_COPY_CONFLICT_MESSAGE);

        const updated = await transaction<{ id: string }[]>`
          UPDATE public.model_checkpoints
          SET
            sources = ${transaction.json(sources)},
            created_at = ${now}::timestamptz,
            created_by = ${context.userId}::uuid,
            error_count = 0,
            warning_count = 0
          WHERE id = ${existing.id}::uuid
            AND created_at = ${data.expectedSavedAt}::timestamptz
          RETURNING id
        `;
        if (!updated[0]) throw new Error(WORKING_COPY_CONFLICT_MESSAGE);
      } else {
        const inserted = await transaction<{ id: string }[]>`
          INSERT INTO public.model_checkpoints (
            project_id, label, sources, error_count, warning_count, created_by, created_at
          )
          VALUES (
            ${data.projectId}::uuid,
            ${WORKING_COPY_LABEL},
            ${transaction.json(sources)},
            0,
            0,
            ${context.userId}::uuid,
            ${now}::timestamptz
          )
          RETURNING id
        `;
        if (!inserted[0]) throw new Error(WORKING_COPY_CONFLICT_MESSAGE);
      }

      await transaction`
        UPDATE public.projects
        SET updated_at = ${now}::timestamptz
        WHERE id = ${project.id}::uuid
      `;
      return { ok: true, savedAt: now };
    });
  });

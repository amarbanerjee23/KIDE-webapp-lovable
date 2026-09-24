import { createServerFn } from "@tanstack/react-start";
import { requireKideAuth } from "@/lib/auth-middleware";
import {
  createNotifications,
  EDIT_ROLES,
  iso,
  recordAudit,
  requireOrganizationAccess,
  requireProjectAccess,
  REVIEW_ROLES,
  type Role,
} from "@/lib/data-access.server";

type OrgWithProjects = {
  id: string;
  name: string;
  slug: string;
  role: Role;
  projects: Array<{
    id: string;
    name: string;
    description: string | null;
    status: string;
    current_stage: number;
    updated_at: string;
  }>;
};

export const listAllProjects = createServerFn({ method: "GET" })
  .middleware([requireKideAuth])
  .handler(async ({ context }): Promise<{ organizations: OrgWithProjects[] }> => {
    const { db, userId } = context;

    const organizations = await db<
      { id: string; name: string; slug: string; role: Role }[]
    >`
      SELECT o.id, o.name, o.slug, r.role
      FROM public.organizations o
      JOIN public.organization_roles r ON r.organization_id = o.id
      WHERE r.user_id = ${userId}::uuid
      ORDER BY o.name
    `;

    if (!organizations.length) return { organizations: [] };

    const projects = await db<
      {
        id: string;
        organization_id: string;
        name: string;
        description: string | null;
        status: string;
        current_stage: number;
        updated_at: string | Date;
      }[]
    >`
      SELECT
        p.id,
        p.organization_id,
        p.name,
        p.description,
        p.status::text AS status,
        p.current_stage,
        p.updated_at
      FROM public.projects p
      JOIN public.organization_roles r
        ON r.organization_id = p.organization_id
       AND r.user_id = ${userId}::uuid
      ORDER BY p.updated_at DESC
    `;

    return {
      organizations: organizations.map((org) => ({
        ...org,
        projects: projects
          .filter((project) => project.organization_id === org.id)
          .map((project) => ({
            id: project.id,
            name: project.name,
            description: project.description,
            status: project.status,
            current_stage: project.current_stage,
            updated_at: iso(project.updated_at) ?? "",
          })),
      })),
    };
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator((input: { organizationId: string; name: string; description?: string }) => input)
  .handler(async ({ data, context }) => {
    const name = data.name.trim().slice(0, 120);
    if (!name) throw new Error("Please give the project a name.");

    await requireOrganizationAccess(context.db, context.userId, data.organizationId, EDIT_ROLES);

    const rows = await context.db<{ id: string; name: string }[]>`
      INSERT INTO public.projects (
        organization_id, name, description, created_by
      )
      VALUES (
        ${data.organizationId}::uuid,
        ${name},
        ${(data.description ?? "").slice(0, 500)},
        ${context.userId}::uuid
      )
      RETURNING id, name
    `;
    const row = rows[0];
    if (!row) throw new Error("Could not create the project.");

    await recordAudit(
      context.db,
      context.userId,
      data.organizationId,
      "project.created",
      "project",
      row.id,
      { name },
      row.id,
    );
    return row;
  });

export const saveCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator(
    (input: {
      projectId: string;
      label: string;
      sources: Record<string, string>;
      errorCount: number;
      warningCount: number;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const project = await requireProjectAccess(
      context.db,
      context.userId,
      data.projectId,
      EDIT_ROLES,
    );
    const label = data.label.trim().slice(0, 120) || "Checkpoint";
    const rows = await context.db<{ id: string; label: string; created_at: string | Date }[]>`
      INSERT INTO public.model_checkpoints (
        project_id, label, sources, error_count, warning_count, created_by
      )
      VALUES (
        ${data.projectId}::uuid,
        ${label},
        ${context.db.json(data.sources)},
        ${data.errorCount},
        ${data.warningCount},
        ${context.userId}::uuid
      )
      RETURNING id, label, created_at
    `;
    const row = rows[0];
    if (!row) throw new Error("Could not save the checkpoint.");

    await recordAudit(
      context.db,
      context.userId,
      project.organization_id,
      "checkpoint.saved",
      "checkpoint",
      row.id,
      { label, errors: data.errorCount },
      project.id,
    );

    return { ...row, created_at: iso(row.created_at) ?? "" };
  });

export const listCheckpoints = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data, context }) => {
    await requireProjectAccess(context.db, context.userId, data.projectId);
    const rows = await context.db<
      {
        id: string;
        label: string;
        sources: Record<string, string>;
        error_count: number;
        warning_count: number;
        created_at: string | Date;
        created_by: string;
      }[]
    >`
      SELECT id, label, sources, error_count, warning_count, created_at, created_by
      FROM public.model_checkpoints
      WHERE project_id = ${data.projectId}::uuid
      ORDER BY created_at DESC
      LIMIT 50
    `;

    return rows.map((row) => ({ ...row, created_at: iso(row.created_at) ?? "" }));
  });

export const requestReview = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator(
    (input: { projectId: string; title: string; summary: string; designFingerprint: string }) =>
      input,
  )
  .handler(async ({ data, context }) => {
    const project = await requireProjectAccess(
      context.db,
      context.userId,
      data.projectId,
      EDIT_ROLES,
    );
    const title = data.title.trim().slice(0, 160);
    if (!title) throw new Error("Please describe what should be reviewed.");

    const rows = await context.db<{ id: string }[]>`
      INSERT INTO public.review_requests (
        project_id, title, summary, design_fingerprint, requested_by
      )
      VALUES (
        ${data.projectId}::uuid,
        ${title},
        ${data.summary.slice(0, 2000)},
        ${data.designFingerprint.slice(0, 200_000)},
        ${context.userId}::uuid
      )
      RETURNING id
    `;
    const row = rows[0];
    if (!row) throw new Error("Could not request the review.");

    const reviewers = await context.db<{ user_id: string; role: Role }[]>`
      SELECT user_id, role
      FROM public.organization_roles
      WHERE organization_id = ${project.organization_id}::uuid
    `;

    await createNotifications(
      context.db,
      reviewers
        .filter(
          (reviewer) =>
            REVIEW_ROLES.includes(reviewer.role) && reviewer.user_id !== context.userId,
        )
        .map((reviewer) => reviewer.user_id),
      project.organization_id,
      "review.requested",
      `Review requested: ${title}`,
      `${project.name} is waiting for a decision.`,
      "/reviews",
    );

    await recordAudit(
      context.db,
      context.userId,
      project.organization_id,
      "review.requested",
      "review",
      row.id,
      { title },
      project.id,
    );
    return row;
  });

export const listReviews = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data, context }) => {
    await requireProjectAccess(context.db, context.userId, data.projectId);

    const reviews = await context.db<
      {
        id: string;
        title: string;
        summary: string;
        status: string;
        created_at: string | Date;
        requested_by: string;
        decided_by: string | null;
        decided_at: string | Date | null;
        decision_note: string | null;
      }[]
    >`
      SELECT
        id, title, summary, status, created_at, requested_by,
        decided_by, decided_at, decision_note
      FROM public.review_requests
      WHERE project_id = ${data.projectId}::uuid
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const comments = await context.db<
      {
        id: string;
        review_id: string;
        body: string;
        anchor: string;
        author_id: string;
        created_at: string | Date;
      }[]
    >`
      SELECT c.id, c.review_id, c.body, c.anchor, c.author_id, c.created_at
      FROM public.review_comments c
      JOIN public.review_requests r ON r.id = c.review_id
      WHERE r.project_id = ${data.projectId}::uuid
      ORDER BY c.created_at ASC
    `;

    return reviews.map((review) => ({
      ...review,
      created_at: iso(review.created_at) ?? "",
      decided_at: iso(review.decided_at),
      comments: comments
        .filter((comment) => comment.review_id === review.id)
        .map((comment) => ({ ...comment, created_at: iso(comment.created_at) ?? "" })),
    }));
  });

export const addReviewComment = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator(
    (input: { projectId: string; reviewId: string; body: string; anchor?: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const body = data.body.trim();
    if (!body) throw new Error("Write something before sending the comment.");

    const project = await requireProjectAccess(context.db, context.userId, data.projectId, [
      ...EDIT_ROLES,
      "reviewer",
    ]);

    const reviewRows = await context.db<{ requested_by: string; title: string }[]>`
      SELECT requested_by, title
      FROM public.review_requests
      WHERE id = ${data.reviewId}::uuid
        AND project_id = ${data.projectId}::uuid
      LIMIT 1
    `;
    const review = reviewRows[0];
    if (!review) throw new Error("Review not found.");

    await context.db`
      INSERT INTO public.review_comments (review_id, author_id, body, anchor)
      VALUES (
        ${data.reviewId}::uuid,
        ${context.userId}::uuid,
        ${body.slice(0, 4000)},
        ${(data.anchor ?? "").slice(0, 200)}
      )
    `;

    if (review.requested_by !== context.userId) {
      await createNotifications(
        context.db,
        [review.requested_by],
        project.organization_id,
        "review.commented",
        `New comment on "${review.title}"`,
        body.slice(0, 160),
        "/reviews",
      );
    }

    return { ok: true };
  });

export const decideReview = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator(
    (input: {
      projectId: string;
      reviewId: string;
      decision: "approved" | "changes_requested";
      note: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const project = await requireProjectAccess(
      context.db,
      context.userId,
      data.projectId,
      REVIEW_ROLES,
    );

    if (data.decision === "changes_requested" && !data.note.trim()) {
      throw new Error("Say what needs to change before sending it back.");
    }

    const rows = await context.db<{ requested_by: string; title: string }[]>`
      UPDATE public.review_requests
      SET
        status = ${data.decision},
        decided_by = ${context.userId}::uuid,
        decided_at = now(),
        decision_note = ${data.note.slice(0, 2000)}
      WHERE id = ${data.reviewId}::uuid
        AND project_id = ${data.projectId}::uuid
      RETURNING requested_by, title
    `;
    const review = rows[0];
    if (!review) throw new Error("Review not found.");

    await createNotifications(
      context.db,
      [review.requested_by],
      project.organization_id,
      `review.${data.decision}`,
      data.decision === "approved"
        ? `Approved: ${review.title}`
        : `Changes requested: ${review.title}`,
      data.note || "No note was added.",
      "/reviews",
    );

    await recordAudit(
      context.db,
      context.userId,
      project.organization_id,
      `review.${data.decision}`,
      "review",
      data.reviewId,
      { note: data.note.slice(0, 200) },
      project.id,
    );

    return { ok: true };
  });

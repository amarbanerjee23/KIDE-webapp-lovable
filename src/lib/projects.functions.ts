import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string; claims: unknown };

async function projectContext(context: Ctx, projectId: string) {
  const { data: project, error } = await context.supabase
    .from("projects")
    .select("id, name, organization_id, status, current_stage")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!project) throw new Error("This project is not available to you.");

  const { data: role } = await context.supabase
    .from("organization_roles")
    .select("role")
    .eq("organization_id", project.organization_id)
    .eq("user_id", context.userId)
    .maybeSingle();

  return { project, role: (role?.role ?? "viewer") as string };
}

async function notify(
  userIds: string[],
  organizationId: string,
  kind: string,
  title: string,
  body: string,
  link: string,
) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("notifications").insert(
    unique.map((user_id) => ({ user_id, organization_id: organizationId, kind, title, body, link })),
  );
}

async function audit(
  context: Ctx,
  organizationId: string,
  projectId: string,
  action: string,
  targetType: string,
  targetId: string,
  summary: Record<string, unknown>,
) {
  await context.supabase.from("audit_events").insert({
    organization_id: organizationId,
    project_id: projectId,
    actor_id: context.userId,
    action,
    target_type: targetType,
    target_id: targetId,
    change_summary: summary,
  });
}

type OrgWithProjects = {
  id: string;
  name: string;
  slug: string;
  role: string;
  projects: Array<{
    id: string;
    name: string;
    description: string | null;
    status: string;
    current_stage: number;
    updated_at: string;
  }>;
};

/** Every organization the person belongs to, with its projects and the member's role. */
export const listAllProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ organizations: OrgWithProjects[] }> => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase
      .from("organization_roles")
      .select("organization_id, role")
      .eq("user_id", userId);
    const orgIds = (roles ?? []).map((r: { organization_id: string }) => r.organization_id);
    if (orgIds.length === 0) return { organizations: [] };

    const { data: organizations } = await supabase
      .from("organizations")
      .select("id, name, slug")
      .in("id", orgIds);
    const { data: projects } = await supabase
      .from("projects")
      .select("id, organization_id, name, description, status, current_stage, updated_at")
      .in("organization_id", orgIds)
      .order("updated_at", { ascending: false });

    type ProjectRow = {
      id: string;
      organization_id: string;
      name: string;
      description: string | null;
      status: string;
      current_stage: number;
      updated_at: string;
    };

    return {
      organizations: (organizations ?? []).map((org: { id: string; name: string; slug: string }) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        role:
          (roles ?? []).find(
            (r: { organization_id: string; role: string }) => r.organization_id === org.id,
          )?.role ?? "viewer",
        projects: ((projects ?? []) as ProjectRow[])
          .filter((p) => p.organization_id === org.id)
          .map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            status: p.status,
            current_stage: p.current_stage,
            updated_at: p.updated_at,
          })),
      })),
    };
  });

/** Create a project inside an organization the person can build in. */
export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; name: string; description?: string }) => input)
  .handler(async ({ data, context }) => {
    const name = data.name.trim().slice(0, 120);
    if (!name) throw new Error("Please give the project a name.");
    const { data: row, error } = await context.supabase
      .from("projects")
      .insert({
        organization_id: data.organizationId,
        name,
        description: (data.description ?? "").slice(0, 500),
        created_by: context.userId,
      })
      .select("id, name")
      .maybeSingle();
    if (error) throw new Error(error.message);
    await audit(context, data.organizationId, row!.id, "project.created", "project", row!.id, { name });
    return row!;
  });

/* -------------------------- project working copy -------------------------- */

const WORKING_COPY_LABEL = "__kide_working_copy__";
const EDIT_ROLES = new Set(["owner", "administrator", "engineer"]);
const MAX_WORKING_COPY_FILES = 100;
const MAX_WORKING_COPY_PATH_LENGTH = 512;
const MAX_WORKING_COPY_FILE_CHARACTERS = 1_000_000;
const MAX_WORKING_COPY_TOTAL_CHARACTERS = 5_000_000;

function validateWorkingCopySources(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Workspace sources must be an object.");
  }

  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > MAX_WORKING_COPY_FILES) {
    throw new Error(`Workspace must contain between 1 and ${MAX_WORKING_COPY_FILES} files.`);
  }

  const sources: Record<string, string> = {};
  let totalCharacters = 0;

  for (const [path, source] of entries) {
    if (
      path.length === 0 ||
      path.length > MAX_WORKING_COPY_PATH_LENGTH ||
      path.includes("\0") ||
      typeof source !== "string"
    ) {
      throw new Error("Workspace contains an invalid file.");
    }
    if (source.length > MAX_WORKING_COPY_FILE_CHARACTERS) {
      throw new Error(`Workspace file '${path}' exceeds the storage limit.`);
    }

    totalCharacters += source.length;
    if (totalCharacters > MAX_WORKING_COPY_TOTAL_CHARACTERS) {
      throw new Error("Workspace exceeds the total storage limit.");
    }

    sources[path] = source;
  }

  return sources;
}

function coerceStoredSources(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 0) return null;

  const sources: Record<string, string> = {};
  for (const [path, source] of entries) {
    if (typeof source !== "string") return null;
    sources[path] = source;
  }
  return sources;
}

export const loadProjectWorkingCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data, context }) => {
    const { role } = await projectContext(context, data.projectId);
    const { data: row, error } = await context.supabase
      .from("model_checkpoints")
      .select("id, sources, created_at")
      .eq("project_id", data.projectId)
      .eq("label", WORKING_COPY_LABEL)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return {
      sources: coerceStoredSources(row?.sources) ?? null,
      savedAt: (row?.created_at as string | undefined) ?? null,
      canEdit: EDIT_ROLES.has(role),
    };
  });

export const saveProjectWorkingCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string; sources: Record<string, string> }) => input)
  .handler(async ({ data, context }) => {
    const { project, role } = await projectContext(context, data.projectId);
    if (!EDIT_ROLES.has(role)) {
      throw new Error("Your project role is read-only.");
    }

    const sources = validateWorkingCopySources(data.sources);
    const now = new Date().toISOString();

    const { data: existing, error: lookupError } = await context.supabase
      .from("model_checkpoints")
      .select("id")
      .eq("project_id", data.projectId)
      .eq("label", WORKING_COPY_LABEL)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) throw new Error(lookupError.message);

    if (existing?.id) {
      const { error } = await context.supabase
        .from("model_checkpoints")
        .update({
          sources,
          created_at: now,
          created_by: context.userId,
          error_count: 0,
          warning_count: 0,
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("model_checkpoints").insert({
        project_id: data.projectId,
        label: WORKING_COPY_LABEL,
        sources,
        error_count: 0,
        warning_count: 0,
        created_by: context.userId,
        created_at: now,
      });
      if (error) throw new Error(error.message);
    }

    const { error: projectError } = await context.supabase
      .from("projects")
      .update({ updated_at: now })
      .eq("id", project.id);
    if (projectError) throw new Error(projectError.message);

    return { ok: true, savedAt: now };
  });

/* -------------------------- saved checkpoints -------------------------- */

export const saveCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    const { project } = await projectContext(context, data.projectId);
    const requestedLabel = data.label.trim().slice(0, 120);
    const label =
      !requestedLabel || requestedLabel === WORKING_COPY_LABEL ? "Checkpoint" : requestedLabel;
    const { data: row, error } = await context.supabase
      .from("model_checkpoints")
      .insert({
        project_id: data.projectId,
        label,
        sources: data.sources,
        error_count: data.errorCount,
        warning_count: data.warningCount,
        created_by: context.userId,
      })
      .select("id, label, created_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    await audit(context, project.organization_id, project.id, "checkpoint.saved", "checkpoint", row!.id, {
      label,
      errors: data.errorCount,
    });
    return row!;
  });

export const listCheckpoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("model_checkpoints")
      .select("id, label, sources, error_count, warning_count, created_at, created_by")
      .eq("project_id", data.projectId)
      .neq("label", WORKING_COPY_LABEL)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      label: string;
      sources: Record<string, string>;
      error_count: number;
      warning_count: number;
      created_at: string;
      created_by: string;
    }>;
  });

/* ---------------------------- review workflow --------------------------- */

export const requestReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { projectId: string; title: string; summary: string; designFingerprint: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const { project } = await projectContext(context, data.projectId);
    const title = data.title.trim().slice(0, 160);
    if (!title) throw new Error("Please describe what should be reviewed.");

    const { data: row, error } = await context.supabase
      .from("review_requests")
      .insert({
        project_id: data.projectId,
        title,
        summary: data.summary.slice(0, 2000),
        design_fingerprint: data.designFingerprint.slice(0, 200_000),
        requested_by: context.userId,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { data: reviewers } = await context.supabase
      .from("organization_roles")
      .select("user_id, role")
      .eq("organization_id", project.organization_id);
    await notify(
      (reviewers ?? [])
        .filter((r: { role: string; user_id: string }) =>
          ["owner", "administrator", "reviewer"].includes(r.role) && r.user_id !== context.userId,
        )
        .map((r: { user_id: string }) => r.user_id),
      project.organization_id,
      "review.requested",
      `Review requested: ${title}`,
      `${project.name} is waiting for a decision.`,
      "/reviews",
    );
    await audit(context, project.organization_id, project.id, "review.requested", "review", row!.id, { title });
    return row!;
  });

export const listReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: reviews, error } = await context.supabase
      .from("review_requests")
      .select("id, title, summary, status, created_at, requested_by, decided_by, decided_at, decision_note")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    const ids = (reviews ?? []).map((r: { id: string }) => r.id);
    const { data: comments } = ids.length
      ? await context.supabase
          .from("review_comments")
          .select("id, review_id, body, anchor, author_id, created_at")
          .in("review_id", ids)
          .order("created_at", { ascending: true })
      : { data: [] };

    type ReviewRow = {
      id: string;
      title: string;
      summary: string;
      status: string;
      created_at: string;
      requested_by: string;
      decided_by: string | null;
      decided_at: string | null;
      decision_note: string | null;
    };
    type CommentRow = {
      id: string;
      review_id: string;
      body: string;
      anchor: string;
      author_id: string;
      created_at: string;
    };

    return ((reviews ?? []) as ReviewRow[]).map((review) => ({
      ...review,
      comments: ((comments ?? []) as CommentRow[]).filter((c) => c.review_id === review.id),
    }));
  });

export const addReviewComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string; reviewId: string; body: string; anchor?: string }) => input)
  .handler(async ({ data, context }) => {
    const body = data.body.trim();
    if (!body) throw new Error("Write something before sending the comment.");
    const { project } = await projectContext(context, data.projectId);
    const { error } = await context.supabase.from("review_comments").insert({
      review_id: data.reviewId,
      author_id: context.userId,
      body: body.slice(0, 4000),
      anchor: (data.anchor ?? "").slice(0, 200),
    });
    if (error) throw new Error(error.message);

    const { data: review } = await context.supabase
      .from("review_requests")
      .select("requested_by, title")
      .eq("id", data.reviewId)
      .maybeSingle();
    if (review && review.requested_by !== context.userId) {
      await notify(
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
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      projectId: string;
      reviewId: string;
      decision: "approved" | "changes_requested";
      note: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { project, role } = await projectContext(context, data.projectId);
    if (!["owner", "administrator", "reviewer"].includes(role))
      throw new Error("Only reviewers, administrators and owners can decide a review.");
    if (data.decision === "changes_requested" && !data.note.trim())
      throw new Error("Say what needs to change before sending it back.");

    const { error } = await context.supabase
      .from("review_requests")
      .update({
        status: data.decision,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
        decision_note: data.note.slice(0, 2000),
      })
      .eq("id", data.reviewId)
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);

    const { data: review } = await context.supabase
      .from("review_requests")
      .select("requested_by, title")
      .eq("id", data.reviewId)
      .maybeSingle();
    if (review) {
      await notify(
        [review.requested_by],
        project.organization_id,
        `review.${data.decision}`,
        data.decision === "approved"
          ? `Approved: ${review.title}`
          : `Changes requested: ${review.title}`,
        data.note || "No note was added.",
        "/reviews",
      );
    }
    await audit(context, project.organization_id, project.id, `review.${data.decision}`, "review", data.reviewId, {
      note: data.note.slice(0, 200),
    });
    return { ok: true };
  });

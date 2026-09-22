import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  coerceStoredSources,
  validateWorkingCopySources,
  WORKING_COPY_LABEL,
} from "@/lib/project-working-copy";

const EDIT_ROLES = new Set(["owner", "administrator", "engineer"]);

export const loadProjectWorkingCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: project, error: projectError } = await context.supabase
      .from("projects")
      .select("id, organization_id")
      .eq("id", data.projectId)
      .maybeSingle();

    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("This project is not available to you.");

    const { data: roleRow, error: roleError } = await context.supabase
      .from("organization_roles")
      .select("role")
      .eq("organization_id", project.organization_id)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (roleError) throw new Error(roleError.message);

    const { data: row, error } = await context.supabase
      .from("model_checkpoints")
      .select("sources, created_at")
      .eq("project_id", data.projectId)
      .eq("label", WORKING_COPY_LABEL)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return {
      sources: coerceStoredSources(row?.sources) ?? null,
      savedAt: row?.created_at ?? null,
      canEdit: EDIT_ROLES.has(roleRow?.role ?? "viewer"),
    };
  });

export const saveProjectWorkingCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string; sources: Record<string, string> }) => input)
  .handler(async ({ data, context }) => {
    const { data: project, error: projectError } = await context.supabase
      .from("projects")
      .select("id, organization_id")
      .eq("id", data.projectId)
      .maybeSingle();

    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("This project is not available to you.");

    const { data: roleRow, error: roleError } = await context.supabase
      .from("organization_roles")
      .select("role")
      .eq("organization_id", project.organization_id)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (roleError) throw new Error(roleError.message);
    if (!EDIT_ROLES.has(roleRow?.role ?? "viewer")) {
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

    const { error: updatedError } = await context.supabase
      .from("projects")
      .update({ updated_at: now })
      .eq("id", project.id);

    if (updatedError) throw new Error(updatedError.message);

    return { ok: true, savedAt: now };
  });

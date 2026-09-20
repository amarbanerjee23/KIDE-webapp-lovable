import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "owner" | "administrator" | "engineer" | "reviewer" | "viewer";

const ADMIN_ROLES: Role[] = ["owner", "administrator"];

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Profile, organizations and the member's role in each. */
export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;

    let { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile) {
      const fallback =
        (claims as { email?: string } | null)?.email?.split("@")[0] ?? "Engineer";
      const { data: created } = await supabase
        .from("profiles")
        .insert({ user_id: userId, display_name: fallback })
        .select("*")
        .maybeSingle();
      profile = created ?? null;
    }

    const { data: roles } = await supabase
      .from("organization_roles")
      .select("organization_id, role")
      .eq("user_id", userId);

    const orgIds = (roles ?? []).map((r) => r.organization_id);
    const { data: organizations } = orgIds.length
      ? await supabase.from("organizations").select("*").in("id", orgIds)
      : { data: [] as Array<{ id: string; name: string; slug: string }> };

    return {
      email: (claims as { email?: string } | null)?.email ?? "",
      userId,
      profile,
      organizations: (organizations ?? []).map((org) => ({
        ...org,
        role: (roles ?? []).find((r) => r.organization_id === org.id)?.role as Role,
      })),
    };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    displayName: string;
    jobTitle: string;
    density: string;
    theme: string;
  }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({
        display_name: data.displayName.slice(0, 80),
        job_title: data.jobTitle.slice(0, 80),
        preferences: { density: data.density, theme: data.theme },
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data, context }) => {
    const name = data.name.trim().slice(0, 80);
    if (!name) throw new Error("Please enter an organization name.");
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const { data: id, error } = await context.supabase.rpc("create_organization", {
      _name: name,
      _slug: slug,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

/** Members, pending invitations and projects of one organization. */
export const getOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: org, error } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!org) throw new Error("Organization not found or not visible to you.");

    const { data: roles } = await supabase
      .from("organization_roles")
      .select("id, user_id, role, created_at")
      .eq("organization_id", data.organizationId);

    const { data: invitations } = await supabase
      .from("invitations")
      .select("id, email, role, status, expires_at, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });

    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, description, status, current_stage, updated_at")
      .eq("organization_id", data.organizationId)
      .order("updated_at", { ascending: false });

    const userIds = [...new Set((roles ?? []).map((r) => r.user_id))];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("user_id, display_name, job_title")
          .in("user_id", userIds)
      : { data: [] as Array<{ user_id: string; display_name: string; job_title: string | null }> };

    return {
      organization: org,
      myRole: (roles ?? []).find((r) => r.user_id === userId)?.role as Role,
      members: (roles ?? []).map((r) => ({
        ...r,
        displayName:
          (profiles ?? []).find((p) => p.user_id === r.user_id)?.display_name ?? "Member",
        jobTitle: (profiles ?? []).find((p) => p.user_id === r.user_id)?.job_title ?? "",
        isSelf: r.user_id === userId,
      })),
      invitations: invitations ?? [],
      projects: projects ?? [],
    };
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; email: string; role: Role }) => input)
  .handler(async ({ data, context }) => {
    const email = data.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
    if (!ADMIN_ROLES.includes(await roleOf(context, data.organizationId)))
      throw new Error("Only owners and administrators can invite people.");

    const token = randomToken();
    const { error } = await context.supabase.from("invitations").insert({
      organization_id: data.organizationId,
      email,
      role: data.role,
      token,
      invited_by: context.userId,
    });
    if (error) throw new Error(error.message);

    await recordAudit(context, data.organizationId, "invitation.created", "invitation", email, {
      role: data.role,
    });
    return { token };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; invitationId: string }) => input)
  .handler(async ({ data, context }) => {
    if (!ADMIN_ROLES.includes(await roleOf(context, data.organizationId)))
      throw new Error("Only owners and administrators can revoke invitations.");
    const { error } = await context.supabase
      .from("invitations")
      .update({ status: "revoked" })
      .eq("id", data.invitationId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    await recordAudit(context, data.organizationId, "invitation.revoked", "invitation", data.invitationId, {});
    return { ok: true };
  });

export const changeMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; memberRoleId: string; role: Role }) => input)
  .handler(async ({ data, context }) => {
    if (!ADMIN_ROLES.includes(await roleOf(context, data.organizationId)))
      throw new Error("Only owners and administrators can change roles.");
    const { error } = await context.supabase
      .from("organization_roles")
      .update({ role: data.role })
      .eq("id", data.memberRoleId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    await recordAudit(context, data.organizationId, "member.role_changed", "member", data.memberRoleId, {
      role: data.role,
    });
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; memberRoleId: string }) => input)
  .handler(async ({ data, context }) => {
    if (!ADMIN_ROLES.includes(await roleOf(context, data.organizationId)))
      throw new Error("Only owners and administrators can remove members.");
    const { data: row } = await context.supabase
      .from("organization_roles")
      .select("user_id, role")
      .eq("id", data.memberRoleId)
      .maybeSingle();
    if (row?.role === "owner") throw new Error("The owner cannot be removed.");
    const { error } = await context.supabase
      .from("organization_roles")
      .delete()
      .eq("id", data.memberRoleId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    await recordAudit(context, data.organizationId, "member.removed", "member", data.memberRoleId, {});
    return { ok: true };
  });

/** Look up an invitation by token — the invitee is not a member yet. */
export const previewInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite } = await supabaseAdmin
      .from("invitations")
      .select("id, email, role, status, expires_at, organization_id")
      .eq("token", data.token)
      .maybeSingle();
    if (!invite) return { found: false as const };
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("id", invite.organization_id)
      .maybeSingle();
    return {
      found: true as const,
      email: invite.email,
      role: invite.role as Role,
      status: invite.status,
      expired: new Date(invite.expires_at).getTime() < Date.now(),
      organizationName: org?.name ?? "Organization",
    };
  });

export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite } = await supabaseAdmin
      .from("invitations")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();

    if (!invite) throw new Error("This invitation link is not valid.");
    if (invite.status !== "pending") throw new Error("This invitation has already been used.");
    if (new Date(invite.expires_at).getTime() < Date.now())
      throw new Error("This invitation has expired. Ask an administrator to send a new one.");

    const email = (context.claims as { email?: string } | null)?.email?.toLowerCase();
    if (email && email !== invite.email.toLowerCase())
      throw new Error(`This invitation was sent to ${invite.email}. Sign in with that address to accept it.`);

    const { data: existing } = await supabaseAdmin
      .from("organization_roles")
      .select("id")
      .eq("organization_id", invite.organization_id)
      .eq("user_id", context.userId)
      .eq("role", invite.role)
      .maybeSingle();
    if (!existing) {
      await supabaseAdmin.from("organization_roles").insert({
        organization_id: invite.organization_id,
        user_id: context.userId,
        role: invite.role,
      });
    }

    await supabaseAdmin
      .from("invitations")
      .update({ status: "accepted", accepted_by: context.userId, accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    await supabaseAdmin.from("notifications").insert({
      user_id: invite.invited_by,
      organization_id: invite.organization_id,
      kind: "invitation.accepted",
      title: `${invite.email} joined the organization`,
      body: `They now have the ${invite.role} role.`,
      link: "/team",
    });

    return { organizationId: invite.organization_id as string };
  });

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    return data ?? [];
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    return { ok: true };
  });

type Ctx = { supabase: any; userId: string; claims: unknown };

async function roleOf(context: Ctx, organizationId: string): Promise<Role> {
  const { data } = await context.supabase
    .from("organization_roles")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", context.userId)
    .maybeSingle();
  return (data?.role ?? "viewer") as Role;
}

async function recordAudit(
  context: Ctx,
  organizationId: string,
  action: string,
  targetType: string,
  targetId: string,
  summary: Record<string, unknown>,
) {
  await context.supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_id: context.userId,
    action,
    target_type: targetType,
    target_id: targetId,
    change_summary: summary,
  });
}

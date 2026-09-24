import { createServerFn } from "@tanstack/react-start";
import { requireKideAuth } from "@/lib/auth-middleware";
import {
  ADMIN_ROLES,
  createNotifications,
  iso,
  recordAudit,
  requireOrganizationAccess,
  type Role,
} from "@/lib/data-access.server";

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([requireKideAuth])
  .handler(async ({ context }) => {
    const { db, userId, user } = context;

    let profiles = await db<
      {
        user_id: string;
        display_name: string;
        avatar_url: string | null;
        job_title: string | null;
        preferences: Record<string, unknown>;
        created_at: string | Date;
        updated_at: string | Date;
      }[]
    >\`
      SELECT *
      FROM public.profiles
      WHERE user_id = \${userId}::uuid
      LIMIT 1
    \`;

    if (!profiles[0]) {
      const fallback = user.email?.split("@")[0] || user.name || "Engineer";
      profiles = await db\`
        INSERT INTO public.profiles (user_id, display_name)
        VALUES (\${userId}::uuid, \${fallback})
        ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING *
      \`;
    }

    const organizations = await db<
      {
        id: string;
        name: string;
        slug: string;
        created_by: string;
        created_at: string | Date;
        updated_at: string | Date;
        role: Role;
      }[]
    >\`
      SELECT o.*, r.role
      FROM public.organizations o
      JOIN public.organization_roles r ON r.organization_id = o.id
      WHERE r.user_id = \${userId}::uuid
      ORDER BY o.name
    \`;

    const profile = profiles[0];
    return {
      email: user.email ?? "",
      userId,
      profile: profile
        ? {
            ...profile,
            created_at: iso(profile.created_at),
            updated_at: iso(profile.updated_at),
          }
        : null,
      organizations: organizations.map((organization) => ({
        ...organization,
        created_at: iso(organization.created_at),
        updated_at: iso(organization.updated_at),
      })),
    };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator(
    (input: {
      displayName: string;
      jobTitle: string;
      density: string;
      theme: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await context.db\`
      INSERT INTO public.profiles (
        user_id, display_name, job_title, preferences, updated_at
      )
      VALUES (
        \${context.userId}::uuid,
        \${data.displayName.slice(0, 80)},
        \${data.jobTitle.slice(0, 80)},
        \${context.db.json({ density: data.density, theme: data.theme })},
        now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        job_title = EXCLUDED.job_title,
        preferences = EXCLUDED.preferences,
        updated_at = now()
    \`;
    return { ok: true };
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data, context }) => {
    const name = data.name.trim().slice(0, 80);
    if (!name) throw new Error("Please enter an organization name.");

    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80);
    const slug = \`\${base || "organization"}-\${crypto.randomUUID().slice(0, 8)}\`;

    return context.db.begin(async (transaction) => {
      const organizations = await transaction<{ id: string }[]>\`
        INSERT INTO public.organizations (name, slug, created_by)
        VALUES (\${name}, \${slug}, \${context.userId}::uuid)
        RETURNING id
      \`;
      const organization = organizations[0];
      if (!organization) throw new Error("Could not create the organization.");

      await transaction\`
        INSERT INTO public.organization_roles (organization_id, user_id, role)
        VALUES (\${organization.id}::uuid, \${context.userId}::uuid, 'owner')
      \`;

      return { id: organization.id };
    });
  });

export const getOrganization = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator((input: { organizationId: string }) => input)
  .handler(async ({ data, context }) => {
    const myRole = await requireOrganizationAccess(
      context.db,
      context.userId,
      data.organizationId,
    );

    const organizations = await context.db<
      {
        id: string;
        name: string;
        slug: string;
        created_by: string;
        created_at: string | Date;
        updated_at: string | Date;
      }[]
    >\`
      SELECT *
      FROM public.organizations
      WHERE id = \${data.organizationId}::uuid
      LIMIT 1
    \`;
    const organization = organizations[0];
    if (!organization) throw new Error("Organization not found or not visible to you.");

    const members = await context.db<
      {
        id: string;
        user_id: string;
        role: Role;
        created_at: string | Date;
        display_name: string | null;
        job_title: string | null;
      }[]
    >\`
      SELECT
        r.id,
        r.user_id,
        r.role,
        r.created_at,
        p.display_name,
        p.job_title
      FROM public.organization_roles r
      LEFT JOIN public.profiles p ON p.user_id = r.user_id
      WHERE r.organization_id = \${data.organizationId}::uuid
      ORDER BY r.created_at
    \`;

    const invitations = await context.db<
      {
        id: string;
        email: string;
        role: Role;
        status: string;
        expires_at: string | Date;
        created_at: string | Date;
      }[]
    >\`
      SELECT id, email, role, status, expires_at, created_at
      FROM public.invitations
      WHERE organization_id = \${data.organizationId}::uuid
      ORDER BY created_at DESC
    \`;

    const projects = await context.db<
      {
        id: string;
        name: string;
        description: string;
        status: string;
        current_stage: number;
        updated_at: string | Date;
      }[]
    >\`
      SELECT id, name, description, status::text AS status, current_stage, updated_at
      FROM public.projects
      WHERE organization_id = \${data.organizationId}::uuid
      ORDER BY updated_at DESC
    \`;

    return {
      organization: {
        ...organization,
        created_at: iso(organization.created_at),
        updated_at: iso(organization.updated_at),
      },
      myRole,
      members: members.map((member) => ({
        id: member.id,
        user_id: member.user_id,
        role: member.role,
        created_at: iso(member.created_at),
        displayName: member.display_name ?? "Member",
        jobTitle: member.job_title ?? "",
        isSelf: member.user_id === context.userId,
      })),
      invitations: invitations.map((invitation) => ({
        ...invitation,
        expires_at: iso(invitation.expires_at),
        created_at: iso(invitation.created_at),
      })),
      projects: projects.map((project) => ({
        ...project,
        updated_at: iso(project.updated_at),
      })),
    };
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator((input: { organizationId: string; email: string; role: Role }) => input)
  .handler(async ({ data, context }) => {
    const email = data.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("Enter a valid email address.");
    }

    await requireOrganizationAccess(
      context.db,
      context.userId,
      data.organizationId,
      ADMIN_ROLES,
    );

    const token = randomToken();
    await context.db\`
      INSERT INTO public.invitations (
        organization_id, email, role, token, invited_by
      )
      VALUES (
        \${data.organizationId}::uuid,
        \${email},
        \${data.role},
        \${token},
        \${context.userId}::uuid
      )
    \`;

    await recordAudit(
      context.db,
      context.userId,
      data.organizationId,
      "invitation.created",
      "invitation",
      email,
      { role: data.role },
    );
    return { token };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator((input: { organizationId: string; invitationId: string }) => input)
  .handler(async ({ data, context }) => {
    await requireOrganizationAccess(
      context.db,
      context.userId,
      data.organizationId,
      ADMIN_ROLES,
    );

    await context.db\`
      UPDATE public.invitations
      SET status = 'revoked'
      WHERE id = \${data.invitationId}::uuid
        AND organization_id = \${data.organizationId}::uuid
    \`;

    await recordAudit(
      context.db,
      context.userId,
      data.organizationId,
      "invitation.revoked",
      "invitation",
      data.invitationId,
      {},
    );
    return { ok: true };
  });

export const changeMemberRole = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator(
    (input: { organizationId: string; memberRoleId: string; role: Role }) => input,
  )
  .handler(async ({ data, context }) => {
    await requireOrganizationAccess(
      context.db,
      context.userId,
      data.organizationId,
      ADMIN_ROLES,
    );

    const members = await context.db<{ user_id: string; role: Role }[]>\`
      SELECT user_id, role
      FROM public.organization_roles
      WHERE id = \${data.memberRoleId}::uuid
        AND organization_id = \${data.organizationId}::uuid
      LIMIT 1
    \`;
    const member = members[0];
    if (!member) throw new Error("Member not found.");
    if (member.role === "owner" && data.role !== "owner") {
      throw new Error("Transfer ownership before changing the owner role.");
    }

    await context.db\`
      UPDATE public.organization_roles
      SET role = \${data.role}
      WHERE id = \${data.memberRoleId}::uuid
        AND organization_id = \${data.organizationId}::uuid
    \`;

    await recordAudit(
      context.db,
      context.userId,
      data.organizationId,
      "member.role_changed",
      "member",
      data.memberRoleId,
      { role: data.role },
    );
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator((input: { organizationId: string; memberRoleId: string }) => input)
  .handler(async ({ data, context }) => {
    await requireOrganizationAccess(
      context.db,
      context.userId,
      data.organizationId,
      ADMIN_ROLES,
    );

    const members = await context.db<{ role: Role }[]>\`
      SELECT role
      FROM public.organization_roles
      WHERE id = \${data.memberRoleId}::uuid
        AND organization_id = \${data.organizationId}::uuid
      LIMIT 1
    \`;
    if (members[0]?.role === "owner") throw new Error("The owner cannot be removed.");

    await context.db\`
      DELETE FROM public.organization_roles
      WHERE id = \${data.memberRoleId}::uuid
        AND organization_id = \${data.organizationId}::uuid
    \`;

    await recordAudit(
      context.db,
      context.userId,
      data.organizationId,
      "member.removed",
      "member",
      data.memberRoleId,
      {},
    );
    return { ok: true };
  });

export const previewInvitation = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data, context }) => {
    const invitations = await context.db<
      {
        email: string;
        role: Role;
        status: string;
        expires_at: string | Date;
        organization_id: string;
        organization_name: string;
      }[]
    >\`
      SELECT
        i.email,
        i.role,
        i.status,
        i.expires_at,
        i.organization_id,
        o.name AS organization_name
      FROM public.invitations i
      JOIN public.organizations o ON o.id = i.organization_id
      WHERE i.token = \${data.token}
      LIMIT 1
    \`;
    const invite = invitations[0];
    if (!invite) return { found: false as const };

    const expiresAt = iso(invite.expires_at) ?? "";
    return {
      found: true as const,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expired: new Date(expiresAt).getTime() < Date.now(),
      organizationName: invite.organization_name,
    };
  });

export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data, context }) => {
    const invitations = await context.db<
      {
        id: string;
        email: string;
        role: Role;
        status: string;
        expires_at: string | Date;
        organization_id: string;
        invited_by: string;
      }[]
    >\`
      SELECT id, email, role, status, expires_at, organization_id, invited_by
      FROM public.invitations
      WHERE token = \${data.token}
      LIMIT 1
    \`;
    const invite = invitations[0];

    if (!invite) throw new Error("This invitation link is not valid.");
    if (invite.status !== "pending") throw new Error("This invitation has already been used.");

    const expiresAt = iso(invite.expires_at) ?? "";
    if (new Date(expiresAt).getTime() < Date.now()) {
      throw new Error("This invitation has expired. Ask an administrator to send a new one.");
    }

    const email = context.user.email?.toLowerCase();
    if (email && email !== invite.email.toLowerCase()) {
      throw new Error(
        \`This invitation was sent to \${invite.email}. Sign in with that address to accept it.\`,
      );
    }

    await context.db.begin(async (transaction) => {
      await transaction\`
        INSERT INTO public.organization_roles (organization_id, user_id, role)
        VALUES (
          \${invite.organization_id}::uuid,
          \${context.userId}::uuid,
          \${invite.role}
        )
        ON CONFLICT (organization_id, user_id) DO NOTHING
      \`;

      await transaction\`
        UPDATE public.invitations
        SET
          status = 'accepted',
          accepted_by = \${context.userId}::uuid,
          accepted_at = now()
        WHERE id = \${invite.id}::uuid
          AND status = 'pending'
      \`;
    });

    await createNotifications(
      context.db,
      [invite.invited_by],
      invite.organization_id,
      "invitation.accepted",
      \`\${invite.email} joined the organization\`,
      \`They now have the \${invite.role} role.\`,
      "/team",
    );

    return { organizationId: invite.organization_id };
  });

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireKideAuth])
  .handler(async ({ context }) => {
    const rows = await context.db<
      {
        id: string;
        user_id: string;
        organization_id: string | null;
        kind: string;
        title: string;
        body: string;
        link: string | null;
        read_at: string | Date | null;
        created_at: string | Date;
      }[]
    >\`
      SELECT *
      FROM public.notifications
      WHERE user_id = \${context.userId}::uuid
      ORDER BY created_at DESC
      LIMIT 30
    \`;

    return rows.map((row) => ({
      ...row,
      read_at: iso(row.read_at),
      created_at: iso(row.created_at),
    }));
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .handler(async ({ context }) => {
    await context.db\`
      UPDATE public.notifications
      SET read_at = now()
      WHERE user_id = \${context.userId}::uuid
        AND read_at IS NULL
    \`;
    return { ok: true };
  });

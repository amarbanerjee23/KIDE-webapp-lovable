import type { KideDatabase } from "@/lib/database.server";

export type Role = "owner" | "administrator" | "engineer" | "reviewer" | "viewer";

export const ADMIN_ROLES: Role[] = ["owner", "administrator"];
export const EDIT_ROLES: Role[] = ["owner", "administrator", "engineer"];
export const REVIEW_ROLES: Role[] = ["owner", "administrator", "reviewer"];

export async function roleOf(
  db: KideDatabase,
  userId: string,
  organizationId: string,
): Promise<Role | null> {
  const rows = await db<{ role: Role }[]>\`
    SELECT role
    FROM public.organization_roles
    WHERE organization_id = \${organizationId}::uuid
      AND user_id = \${userId}::uuid
    LIMIT 1
  \`;
  return rows[0]?.role ?? null;
}

export async function requireOrganizationAccess(
  db: KideDatabase,
  userId: string,
  organizationId: string,
  allowed?: readonly Role[],
): Promise<Role> {
  const role = await roleOf(db, userId, organizationId);
  if (!role) throw new Error("This organization is not available to you.");
  if (allowed && !allowed.includes(role)) throw new Error("Your role does not allow this action.");
  return role;
}

export async function requireProjectAccess(
  db: KideDatabase,
  userId: string,
  projectId: string,
  allowed?: readonly Role[],
) {
  const rows = await db<
    {
      id: string;
      name: string;
      organization_id: string;
      status: string;
      current_stage: number;
      role: Role;
    }[]
  >\`
    SELECT
      p.id,
      p.name,
      p.organization_id,
      p.status::text AS status,
      p.current_stage,
      r.role
    FROM public.projects p
    JOIN public.organization_roles r
      ON r.organization_id = p.organization_id
     AND r.user_id = \${userId}::uuid
    WHERE p.id = \${projectId}::uuid
    LIMIT 1
  \`;

  const project = rows[0];
  if (!project) throw new Error("This project is not available to you.");
  if (allowed && !allowed.includes(project.role)) {
    throw new Error("Your project role does not allow this action.");
  }
  return project;
}

export async function recordAudit(
  db: KideDatabase,
  userId: string,
  organizationId: string,
  action: string,
  targetType: string,
  targetId: string,
  summary: Record<string, unknown>,
  projectId?: string | null,
) {
  await db\`
    INSERT INTO public.audit_events (
      organization_id, project_id, actor_id, action, target_type, target_id, change_summary
    )
    VALUES (
      \${organizationId}::uuid,
      \${projectId ?? null}::uuid,
      \${userId}::uuid,
      \${action},
      \${targetType},
      \${targetId},
      \${db.json(summary)}
    )
  \`;
}

export async function createNotifications(
  db: KideDatabase,
  userIds: string[],
  organizationId: string | null,
  kind: string,
  title: string,
  body: string,
  link: string | null,
) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;

  for (const userId of unique) {
    await db\`
      INSERT INTO public.notifications (
        user_id, organization_id, kind, title, body, link
      )
      VALUES (
        \${userId}::uuid,
        \${organizationId}::uuid,
        \${kind},
        \${title},
        \${body},
        \${link}
      )
    \`;
  }
}

export function iso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { WorkspaceHeader } from "@/components/kide/WorkspaceHeader";
import { Button } from "@/components/ui/button";
import {
  getWorkspace, getOrganization, createOrganization, inviteMember,
  revokeInvitation, changeMemberRole, removeMember,
} from "@/lib/teams.functions";

const title = "KIDE Team — organizations, roles and invitations";
const description = "Invite engineers and reviewers, set their role, and keep an audit trail of every membership change.";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [
    { title }, { name: "description", content: description },
    { property: "og:title", content: title }, { property: "og:description", content: description },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: TeamPage,
});

const ROLES = ["owner", "administrator", "engineer", "reviewer", "viewer"] as const;
type Role = (typeof ROLES)[number];

function TeamPage() {
  const loadWorkspace = useServerFn(getWorkspace);
  const loadOrg = useServerFn(getOrganization);
  const createOrg = useServerFn(createOrganization);
  const invite = useServerFn(inviteMember);
  const revoke = useServerFn(revokeInvitation);
  const changeRole = useServerFn(changeMemberRole);
  const remove = useServerFn(removeMember);

  const [workspace, setWorkspace] = useState<Awaited<ReturnType<typeof getWorkspace>> | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [org, setOrg] = useState<Awaited<ReturnType<typeof getOrganization>> | null>(null);
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("engineer");
  const [busy, setBusy] = useState(false);

  const refreshWorkspace = async () => {
    const data = await loadWorkspace();
    setWorkspace(data);
    if (!orgId && data.organizations[0]) setOrgId(data.organizations[0].id);
  };

  const refreshOrg = async (id: string) => setOrg(await loadOrg({ data: { organizationId: id } }));

  useEffect(() => { void refreshWorkspace(); }, []);
  useEffect(() => { if (orgId) void refreshOrg(orgId); }, [orgId]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      if (orgId) await refreshOrg(orgId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const isAdmin = org?.myRole === "owner" || org?.myRole === "administrator";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <WorkspaceHeader current="Team" />
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-xl font-semibold">Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          People, roles and invitations for the organizations you belong to.
        </p>

        {workspace && workspace.organizations.length === 0 && (
          <section className="mt-6 rounded-md border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">Create your organization</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              An organization holds your projects, your team and your review history.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={orgName}
                onChange={(event) => setOrgName(event.target.value)}
                placeholder="Acme Robotics"
                className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <Button
                disabled={busy || !orgName.trim()}
                onClick={() =>
                  run("Organization created", async () => {
                    const created = await createOrg({ data: { name: orgName } });
                    setOrgName("");
                    setOrgId(created.id);
                    await refreshWorkspace();
                  })
                }
              >
                Create
              </Button>
            </div>
          </section>
        )}

        {workspace && workspace.organizations.length > 1 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {workspace.organizations.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={item.id === orgId ? "secondary" : "outline"}
                onClick={() => setOrgId(item.id)}
              >
                {item.name}
              </Button>
            ))}
          </div>
        )}

        {org && (
          <>
            <section className="mt-6 rounded-md border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">{org.organization.name}</h2>
                  <p className="text-[11px] text-muted-foreground">
                    {org.members.length} members · you are {org.myRole}
                  </p>
                </div>
              </div>
              <ul className="divide-y divide-border">
                {org.members.map((member) => (
                  <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {member.displayName}
                        {member.isSelf && <span className="ml-2 text-[10px] text-muted-foreground">you</span>}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{member.jobTitle || "—"}</p>
                    </div>
                    <select
                      value={member.role}
                      disabled={!isAdmin || member.role === "owner" || busy}
                      onChange={(event) =>
                        run("Role updated", () =>
                          changeRole({
                            data: {
                              organizationId: org.organization.id,
                              memberRoleId: member.id,
                              role: event.target.value as Role,
                            },
                          }),
                        )
                      }
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {ROLES.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    {isAdmin && member.role !== "owner" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          run("Member removed", () =>
                            remove({ data: { organizationId: org.organization.id, memberRoleId: member.id } }),
                          )
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {isAdmin && (
              <section className="mt-6 rounded-md border border-border bg-card p-4">
                <h2 className="text-sm font-semibold">Invite someone</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="engineer@company.com"
                    className="h-9 min-w-56 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                  />
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value as Role)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {ROLES.filter((item) => item !== "owner").map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                  <Button
                    disabled={busy || !email.trim()}
                    onClick={() =>
                      run("Invitation created", async () => {
                        const result = await invite({
                          data: { organizationId: org.organization.id, email, role },
                        });
                        setEmail("");
                        const link = `${window.location.origin}/invite/${result.token}`;
                        await navigator.clipboard?.writeText(link).catch(() => undefined);
                        toast.message("Invite link copied", { description: link });
                      })
                    }
                  >
                    Send invite
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  The invite link is copied to your clipboard. It works once and expires in 14 days.
                </p>
              </section>
            )}

            <section className="mt-6 rounded-md border border-border bg-card">
              <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Invitations</h2>
              {org.invitations.length === 0 ? (
                <p className="px-4 py-4 text-xs text-muted-foreground">No invitations yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {org.invitations.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">{item.email}</span>
                      <span className="text-[11px] text-muted-foreground">{item.role}</span>
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] ${
                        item.status === "pending" ? "border-warning/40 text-warning" :
                        item.status === "accepted" ? "border-primary/40 text-primary" :
                        "border-border text-muted-foreground"
                      }`}>
                        {item.status}
                      </span>
                      {isAdmin && item.status === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            run("Invitation revoked", () =>
                              revoke({ data: { organizationId: org.organization.id, invitationId: item.id } }),
                            )
                          }
                        >
                          Revoke
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

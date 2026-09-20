import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acceptInvitation, previewInvitation } from "@/lib/teams.functions";

const title = "KIDE invitation — join an engineering organization";
const description = "Accept your invitation to a KIDE organization and start collaborating on control software designs.";

export const Route = createFileRoute("/_authenticated/invite/$token")({
  head: () => ({ meta: [
    { title }, { name: "description", content: description },
    { property: "og:title", content: title }, { property: "og:description", content: description },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = useParams({ from: "/_authenticated/invite/$token" });
  const navigate = useNavigate();
  const preview = useServerFn(previewInvitation);
  const accept = useServerFn(acceptInvitation);
  const [state, setState] = useState<Awaited<ReturnType<typeof previewInvitation>> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => setState(await preview({ data: { token } })))();
  }, [token]);

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-md border border-border bg-card p-6">
        {!state && <p className="text-sm text-muted-foreground">Checking your invitation…</p>}
        {state && !state.found && (
          <p className="text-sm">This invitation link is not valid. Ask an administrator to send a new one.</p>
        )}
        {state?.found && (
          <>
            <h1 className="text-lg font-semibold">Join {state.organizationName}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Invited as <strong className="text-foreground">{state.role}</strong> for {state.email}.
            </p>
            {state.status !== "pending" && (
              <p className="mt-3 text-sm text-warning">This invitation has already been {state.status}.</p>
            )}
            {state.expired && state.status === "pending" && (
              <p className="mt-3 text-sm text-warning">This invitation has expired.</p>
            )}
            <Button
              className="mt-5 w-full"
              disabled={busy || state.status !== "pending" || state.expired}
              onClick={async () => {
                setBusy(true);
                try {
                  await accept({ data: { token } });
                  toast.success(`You joined ${state.organizationName}`);
                  void navigate({ to: "/team" });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not accept the invitation.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Accept invitation
            </Button>
          </>
        )}
      </div>
    </main>
  );
}

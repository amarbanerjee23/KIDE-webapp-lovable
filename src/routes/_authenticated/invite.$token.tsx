import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getServerSession } from "@/lib/auth.functions";
import { isInvitationLandingPath } from "@/lib/auth/session-policy";
import { acceptInvitation, previewInvitation } from "@/lib/teams.functions";

const title = "KIDE invitation — join an engineering organization";
const description =
  "Accept your invitation to a KIDE organization and collaborate on control software designs.";

export const Route = createFileRoute("/_authenticated/invite/$token")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = useParams({ from: "/_authenticated/invite/$token" });
  const navigate = useNavigate();
  const session = useServerFn(getServerSession);
  const preview = useServerFn(previewInvitation);
  const accept = useServerFn(acceptInvitation);
  const [authStatus, setAuthStatus] = useState<
    "checking" | "anonymous" | "authenticated" | "error"
  >("checking");
  const [state, setState] = useState<Awaited<ReturnType<typeof previewInvitation>> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const validToken = isInvitationLandingPath(`/invite/${token}`);

  useEffect(() => {
    if (!validToken) {
      setAuthStatus("anonymous");
      return;
    }
    let active = true;
    setAuthStatus("checking");
    void session()
      .then((value) => {
        if (active) setAuthStatus(value?.session && value.user ? "authenticated" : "anonymous");
      })
      .catch(() => {
        if (active) setAuthStatus("error");
      });
    return () => {
      active = false;
    };
  }, [token, validToken, session]);

  useEffect(() => {
    if (!validToken || authStatus !== "authenticated") return;
    let active = true;
    setState(null);
    setError("");
    void preview({ data: { token } })
      .then((result) => {
        if (active) setState(result);
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Could not check this invitation.");
        }
      });
    return () => {
      active = false;
    };
  }, [token, validToken, authStatus, preview]);

  const authUrl = `/auth?returnTo=${encodeURIComponent(`/invite/${token}`)}`;

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-md border border-border bg-card p-6">
        {!validToken ? (
          <p role="alert" className="text-sm">
            This invitation link is not valid. Ask an administrator to create another one.
          </p>
        ) : authStatus === "checking" ? (
          <p className="text-sm text-muted-foreground">Checking your invitation…</p>
        ) : authStatus === "error" ? (
          <div role="alert" className="space-y-3 text-sm">
            <p>Could not check your sign-in session. Please try signing in.</p>
            <Button asChild variant="outline">
              <a href={authUrl}>Sign in to KIDE</a>
            </Button>
          </div>
        ) : authStatus === "anonymous" ? (
          <div className="space-y-4">
            <h1 className="text-lg font-semibold">Your KIDE invitation</h1>
            <p className="text-sm text-muted-foreground">
              Sign in or create an account with the invited email address to view and accept this
              invitation. Your invitation link will be preserved.
            </p>
            <Button asChild className="w-full">
              <a href={authUrl}>Sign in or create account</a>
            </Button>
          </div>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : !state ? (
          <p className="text-sm text-muted-foreground">Checking your invitation…</p>
        ) : !state.found ? (
          <p className="text-sm">
            This invitation link is not valid. Ask an administrator to create another one.
          </p>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Join {state.organizationName}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              <span>Invited as </span>
              <strong className="text-foreground">{state.role}</strong>
              <span> for {state.email}.</span>
            </p>
            {state.status !== "pending" && (
              <p className="mt-3 text-sm text-warning">
                This invitation has already been {state.status}.
              </p>
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
                } catch (cause) {
                  toast.error(
                    cause instanceof Error ? cause.message : "Could not accept the invitation.",
                  );
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

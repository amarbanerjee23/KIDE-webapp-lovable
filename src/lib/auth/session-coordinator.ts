import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AUTH_CHANGED_EVENT } from "@/lib/auth-client";
import { clearActiveProject } from "@/lib/active-project";
import { getServerSession } from "@/lib/auth.functions";
import { rememberPostAuthRedirect } from "@/lib/auth/post-auth-redirect";
import {
  isPublicSessionPath,
  requiresActiveSession,
  type BrowserSessionState,
} from "@/lib/auth/session-policy";
import { clearWorkspaceAccess } from "@/lib/kide/workspace-access";
import { clearWorkspace } from "@/lib/kide/workspace-store";

const ROOT_PATH = "/";
const AUTH_PATH = "/auth";

function currentBrowserTarget(): string {
  if (typeof window === "undefined") return ROOT_PATH;
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function useAuthSessionCoordinator(
  router: AnyRouter,
  queryClient: QueryClient,
  pathname: string,
): BrowserSessionState {
  const [state, setState] = useState<BrowserSessionState>({
    status: "checking",
    verifiedPath: null,
  });

  useEffect(() => {
    let active = true;
    let latestReconciliation = 0;

    const goHome = async () => {
      if (!active || typeof window === "undefined") return;

      setState({ status: "anonymous", verifiedPath: null });
      clearActiveProject();
      clearWorkspaceAccess();
      clearWorkspace();
      queryClient.clear();

      if (isPublicSessionPath(pathname)) return;

      rememberPostAuthRedirect(currentBrowserTarget());
      window.location.replace(ROOT_PATH);
    };

    const markAuthenticated = () => {
      if (!active || typeof window === "undefined") return;

      setState({ status: "authenticated", verifiedPath: pathname });
      void queryClient.invalidateQueries();

      if (pathname !== ROOT_PATH && pathname !== AUTH_PATH) {
        router.invalidate();
      }
    };

    const reconcile = async () => {
      if (!active) return;
      const reconciliationId = ++latestReconciliation;

      if (requiresActiveSession(pathname)) {
        setState((current) =>
          current.verifiedPath === pathname ? current : { status: "checking", verifiedPath: null },
        );
      }

      // Use the same server-side session source as the protected-route guard.
      // Better Auth's public browser session endpoint can rate-limit repeated
      // navigation requests behind a proxy's shared client-IP bucket, which
      // otherwise falsely logs out an authenticated workspace.
      let activeSession: Awaited<ReturnType<typeof getServerSession>> = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          activeSession = await getServerSession();
        } catch {
          activeSession = null;
        }
        if (activeSession?.session && activeSession.user) break;
        if (attempt < 2) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
        }
      }

      // Ignore results of obsolete focus/visibility/route checks. Without
      // this guard a slower null response could override a newer success.
      if (!active || reconciliationId !== latestReconciliation) return;

      if (!activeSession) {
        await goHome();
      } else {
        markAuthenticated();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void reconcile();
    };

    void reconcile();
    window.addEventListener("focus", reconcile);
    window.addEventListener(AUTH_CHANGED_EVENT, reconcile);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      window.removeEventListener("focus", reconcile);
      window.removeEventListener(AUTH_CHANGED_EVENT, reconcile);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname, queryClient, router]);

  return state;
}

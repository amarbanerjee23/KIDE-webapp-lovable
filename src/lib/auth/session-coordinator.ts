import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AUTH_CHANGED_EVENT } from "@/lib/auth-client";
import { clearActiveProject } from "@/lib/active-project";
import { waitForActiveBrowserSession } from "@/lib/auth/active-session";
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

      // Cookie propagation, rate-limited responses and transient network
      // errors must not cause spurious logout after one failed client read.
      // Three bounded checks still fail closed if no valid session exists.
      const activeSession = await waitForActiveBrowserSession({
        attempts: 3,
        delayMs: 150,
        attemptTimeoutMs: 2_000,
      });

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

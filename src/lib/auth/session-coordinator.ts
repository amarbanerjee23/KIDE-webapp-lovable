import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { clearActiveProject } from "@/lib/active-project";
import { consumePostAuthRedirect, rememberPostAuthRedirect } from "@/lib/auth/post-auth-redirect";
import { resetWorkspace } from "@/lib/kide/workspace-store";
import {
  isPublicSessionPath,
  requiresActiveSession,
  type BrowserSessionState,
} from "@/lib/auth/session-policy";

const ROOT_PATH = "/";
const AUTH_PATH = "/auth";
const DEFAULT_AUTHENTICATED_PATH = "/projects";

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

    const goHome = async () => {
      if (!active || typeof window === "undefined") return;

      setState({ status: "anonymous", verifiedPath: null });
      clearActiveProject();
      resetWorkspace();
      queryClient.clear();

      if (isPublicSessionPath(pathname)) return;

      rememberPostAuthRedirect(currentBrowserTarget());
      await router.navigate({ to: ROOT_PATH, replace: true });
    };

    const markAuthenticated = async () => {
      if (!active || typeof window === "undefined") return;

      setState({ status: "authenticated", verifiedPath: pathname });
      void queryClient.invalidateQueries();

      if (pathname === ROOT_PATH) {
        return;
      }

      if (pathname !== AUTH_PATH) {
        router.invalidate();
        return;
      }

      const target = consumePostAuthRedirect();
      if (target === DEFAULT_AUTHENTICATED_PATH) {
        await router.navigate({ to: DEFAULT_AUTHENTICATED_PATH, replace: true });
        return;
      }

      window.location.replace(target);
    };

    const reconcile = async () => {
      if (!active) return;

      if (!isSupabaseConfigured) {
        await goHome();
        return;
      }

      if (requiresActiveSession(pathname)) {
        setState((current) =>
          current.verifiedPath === pathname ? current : { status: "checking", verifiedPath: null },
        );
      }

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!active) return;

      if (error) {
        console.warn("[Auth] Session reconciliation failed:", error.message);
      }

      if (!session || error) {
        await goHome();
      } else {
        await markAuthenticated();
      }
    };

    void reconcile();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === "SIGNED_OUT" || !session) {
        void goHome();
        return;
      }

      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        void markAuthenticated();
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [pathname, queryClient, router]);

  return state;
}

import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { consumePostAuthRedirect, rememberPostAuthRedirect } from "@/lib/auth/post-auth-redirect";
import { isPublicSessionPath, type BrowserSessionStatus } from "@/lib/auth/session-policy";

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
): BrowserSessionStatus {
  const [status, setStatus] = useState<BrowserSessionStatus>("checking");

  useEffect(() => {
    let active = true;

    const goHome = async () => {
      if (!active || typeof window === "undefined") return;

      setStatus("anonymous");
      queryClient.clear();

      if (isPublicSessionPath(window.location.pathname)) return;

      rememberPostAuthRedirect(currentBrowserTarget());
      await router.navigate({ to: ROOT_PATH, replace: true });
    };

    const enterAuthenticatedApp = async () => {
      if (!active || typeof window === "undefined") return;

      setStatus("authenticated");
      void queryClient.invalidateQueries();

      if (window.location.pathname !== ROOT_PATH && window.location.pathname !== AUTH_PATH) {
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
        await enterAuthenticatedApp();
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
        void enterAuthenticatedApp();
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient, router]);

  return status;
}

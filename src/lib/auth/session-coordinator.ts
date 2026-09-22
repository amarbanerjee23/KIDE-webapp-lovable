import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import {
  consumePostAuthRedirect,
  rememberPostAuthRedirect,
} from "@/lib/auth/post-auth-redirect";

const AUTH_PATH = "/auth";
const ROOT_PATH = "/";
const DEFAULT_AUTHENTICATED_PATH = "/projects";

function currentBrowserTarget(): string {
  if (typeof window === "undefined") return ROOT_PATH;
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

async function goToAuth(router: AnyRouter, queryClient: QueryClient) {
  if (typeof window === "undefined" || window.location.pathname === AUTH_PATH) return;

  const current = currentBrowserTarget();
  if (window.location.pathname !== ROOT_PATH) {
    rememberPostAuthRedirect(current);
  }

  queryClient.clear();
  await router.navigate({ to: AUTH_PATH, replace: true });
}

async function enterAuthenticatedApp(router: AnyRouter, queryClient: QueryClient) {
  if (typeof window === "undefined") return;

  queryClient.invalidateQueries();

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
}

export function useAuthSessionCoordinator(router: AnyRouter, queryClient: QueryClient) {
  useEffect(() => {
    let active = true;

    const reconcile = async () => {
      if (!active) return;

      if (!isSupabaseConfigured) {
        await goToAuth(router, queryClient);
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
        await goToAuth(router, queryClient);
      } else {
        await enterAuthenticatedApp(router, queryClient);
      }
    };

    void reconcile();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === "SIGNED_OUT" || !session) {
        void goToAuth(router, queryClient);
        return;
      }

      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        void enterAuthenticatedApp(router, queryClient);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient, router]);
}

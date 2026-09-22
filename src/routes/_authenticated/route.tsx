import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { getActiveBrowserSession } from "@/lib/auth/active-session";
import { rememberPostAuthRedirect } from "@/lib/auth/post-auth-redirect";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const redirectHome = () => {
      rememberPostAuthRedirect(location.href);
      return redirect({ to: "/" });
    };

    if (!isSupabaseConfigured) {
      throw redirectHome();
    }

    const activeSession = await getActiveBrowserSession();

    if (!activeSession) {
      throw redirectHome();
    }

    return { user: activeSession.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return <Outlet />;
}

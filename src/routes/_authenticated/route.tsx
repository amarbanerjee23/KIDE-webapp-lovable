import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
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

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      if (error) {
        console.warn("[Auth] Protected-route session check failed:", error.message);
      }
      throw redirectHome();
    }

    return { user: session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return <Outlet />;
}

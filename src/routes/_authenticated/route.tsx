import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { rememberPostAuthRedirect } from "@/lib/auth/post-auth-redirect";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const redirectToAuth = () => {
      rememberPostAuthRedirect(location.href);
      return redirect({ to: "/auth" });
    };

    if (!isSupabaseConfigured) {
      throw redirectToAuth();
    }

    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      if (error) {
        console.warn("[Auth] Protected-route validation failed:", error.message);
      }
      throw redirectToAuth();
    }

    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return <Outlet />;
}

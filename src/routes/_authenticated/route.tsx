import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import {
  isSupabaseConfigured,
  supabase,
} from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (!isSupabaseConfigured) {
      throw redirect({ to: "/auth" });
    }

    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      if (error) {
        console.warn("[Auth] Protected-route validation failed:", error.message);
      }
      throw redirect({ to: "/auth" });
    }

    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return <Outlet />;
}

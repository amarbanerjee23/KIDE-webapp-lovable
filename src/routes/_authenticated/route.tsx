import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getServerSession } from "@/lib/auth.functions";
import { rememberPostAuthRedirect } from "@/lib/auth/post-auth-redirect";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const session = await getServerSession();

    if (!session) {
      rememberPostAuthRedirect(location.href);
      throw redirect({ to: "/" });
    }

    return { user: session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return <Outlet />;
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

const title = "KIDE — Knowledge-integrated systems engineering";
const description =
  "Securely route into the KIDE engineering workspace based on the active session.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      try {
        if (!isSupabaseConfigured) {
          await navigate({ to: "/auth", search: {}, replace: true });
          return;
        }

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (!active) return;

        if (error) {
          console.warn("[Auth] Session check failed:", error.message);
        }

        if (!error && session) {
          await navigate({ to: "/projects", replace: true });
        } else {
          await navigate({ to: "/auth", search: {}, replace: true });
        }
      } catch (error) {
        if (!active) return;
        console.error("[Auth] Unexpected session check failure:", error);
        await navigate({ to: "/auth", replace: true });
      } finally {
        if (active) setIsChecking(false);
      }
    };

    void checkSession();

    return () => {
      active = false;
    };
  }, [navigate]);

  if (!isChecking) return null;

  return (
    <main className="grid min-h-screen place-items-center bg-background text-foreground">
      <div className="text-center">
        <img src="/favicon.png" alt="" className="mx-auto size-10" />
        <p className="mt-4 text-sm font-medium">Initializing K-IDE Workspace…</p>
        <p className="mt-1 text-xs text-muted-foreground">Checking your secure session</p>
      </div>
    </main>
  );
}

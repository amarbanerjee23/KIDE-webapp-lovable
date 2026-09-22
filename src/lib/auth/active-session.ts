import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export interface ActiveBrowserSession {
  session: Session;
  user: User;
}

export async function getActiveBrowserSession(): Promise<ActiveBrowserSession | null> {
  if (!isSupabaseConfigured) return null;

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return null;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || user.id !== session.user.id) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return null;
  }

  return { session, user };
}

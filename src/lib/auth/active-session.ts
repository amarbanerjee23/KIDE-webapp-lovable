import { authClient } from "@/lib/auth-client";

export async function getActiveBrowserSession() {
  const { data, error } = await authClient.getSession();

  if (error || !data?.session || !data.user) {
    return null;
  }

  return data;
}

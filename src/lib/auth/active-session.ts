import { authClient } from "@/lib/auth-client";

export const BROWSER_SESSION_TIMEOUT_MS = 5_000;

export async function getActiveBrowserSession(timeoutMs: number = BROWSER_SESSION_TIMEOUT_MS) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      authClient.getSession(),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);

    if (!result || !("data" in result)) return null;

    const { data, error } = result;
    if (error || !data?.session || !data.user) return null;
    return data;
  } catch (error) {
    console.warn(
      "[KIDE Auth Session] Browser session validation failed closed.",
      error instanceof Error ? error.message : error,
    );
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

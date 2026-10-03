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

export interface ActiveSessionRetryOptions {
  attempts?: number;
  delayMs?: number;
  attemptTimeoutMs?: number;
}

/**
 * Better Auth can finish the credential request a fraction before the freshly
 * issued cookie is observable to a follow-up session request. After a
 * successful sign-in/sign-up, wait for that cookie to become server-verifiable
 * instead of treating the first empty read as an authentication failure.
 */
export async function waitForActiveBrowserSession({
  attempts = 5,
  delayMs = 150,
  attemptTimeoutMs = 1_000,
}: ActiveSessionRetryOptions = {}) {
  const boundedAttempts = Math.max(1, attempts);

  for (let attempt = 0; attempt < boundedAttempts; attempt += 1) {
    const session = await getActiveBrowserSession(attemptTimeoutMs);
    if (session) return session;

    if (attempt < boundedAttempts - 1 && delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
}

const POST_AUTH_REDIRECT_KEY = "kide:post-auth-redirect";
const DEFAULT_AUTHENTICATED_PATH = "/projects";

export function normalizePostAuthRedirect(
  value: string | null | undefined,
  origin: string,
): string {
  if (!value) return DEFAULT_AUTHENTICATED_PATH;

  try {
    const target = new URL(value, origin);
    if (target.origin !== origin || target.pathname === "/auth" || target.pathname === "/") {
      return DEFAULT_AUTHENTICATED_PATH;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return DEFAULT_AUTHENTICATED_PATH;
  }
}

export function rememberPostAuthRedirect(value: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, value);
}

export function clearPostAuthRedirect(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);
}

export function consumePostAuthRedirect(): string {
  if (typeof window === "undefined") return DEFAULT_AUTHENTICATED_PATH;

  const value = window.sessionStorage.getItem(POST_AUTH_REDIRECT_KEY);
  window.sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);
  return normalizePostAuthRedirect(value, window.location.origin);
}

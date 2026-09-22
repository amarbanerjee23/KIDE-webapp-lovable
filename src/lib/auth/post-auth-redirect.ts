const POST_AUTH_REDIRECT_KEY = "kide:post-auth-redirect";

export function rememberPostAuthRedirect(value: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, value);
}

export function consumePostAuthRedirect(): string {
  if (typeof window === "undefined") return "/projects";

  const value = window.sessionStorage.getItem(POST_AUTH_REDIRECT_KEY);
  window.sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);

  if (!value) return "/projects";

  try {
    const target = new URL(value, window.location.origin);
    if (target.origin !== window.location.origin || target.pathname === "/auth") {
      return "/projects";
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/projects";
  }
}

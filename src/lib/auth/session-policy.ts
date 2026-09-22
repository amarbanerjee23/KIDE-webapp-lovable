export type BrowserSessionStatus = "checking" | "authenticated" | "anonymous";

const PUBLIC_SESSION_PATHS = new Set(["/", "/auth"]);

export function isPublicSessionPath(pathname: string): boolean {
  return PUBLIC_SESSION_PATHS.has(pathname);
}

export function requiresActiveSession(pathname: string): boolean {
  return !isPublicSessionPath(pathname);
}

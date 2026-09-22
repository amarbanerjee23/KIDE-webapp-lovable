export type BrowserSessionStatus = "checking" | "authenticated" | "anonymous";

export interface BrowserSessionState {
  status: BrowserSessionStatus;
  verifiedPath: string | null;
}

const PUBLIC_SESSION_PATHS = new Set(["/", "/auth"]);

export function isPublicSessionPath(pathname: string): boolean {
  return PUBLIC_SESSION_PATHS.has(pathname);
}

export function requiresActiveSession(pathname: string): boolean {
  return !isPublicSessionPath(pathname);
}

export function isPathSessionVerified(
  pathname: string,
  state: BrowserSessionState,
): boolean {
  if (!requiresActiveSession(pathname)) return true;
  return state.status === "authenticated" && state.verifiedPath === pathname;
}

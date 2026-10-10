export type BrowserSessionStatus = "checking" | "authenticated" | "anonymous";

export interface BrowserSessionState {
  status: BrowserSessionStatus;
  verifiedPath: string | null;
}

const PUBLIC_SESSION_PATHS = new Set(["/", "/auth"]);
const INVITATION_PATH = /^\/invite\/[0-9a-f]{48}\/?$/i;

export function isInvitationLandingPath(pathname: string): boolean {
  return INVITATION_PATH.test(pathname);
}

export function isPublicSessionPath(pathname: string): boolean {
  return PUBLIC_SESSION_PATHS.has(pathname) || isInvitationLandingPath(pathname);
}

export function requiresActiveSession(pathname: string): boolean {
  return !isPublicSessionPath(pathname);
}

export function isPathSessionVerified(pathname: string, state: BrowserSessionState): boolean {
  if (!requiresActiveSession(pathname)) return true;
  return state.status === "authenticated" && state.verifiedPath === pathname;
}
